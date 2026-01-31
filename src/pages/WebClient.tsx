// ============================================================================
// WebClient - Interface web responsive pour mobiles/navigateurs
// Permet d'envoyer et recevoir des fichiers vers/depuis le PC
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Wifi,
    Upload,
    Download,
    FileIcon,
    CheckCircle,
    XCircle,
    RefreshCw,
    Smartphone,
    Monitor,
    Loader2
} from 'lucide-react';

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

interface AvailableFile {
    id: string;
    name: string;
}

interface TransferProgress {
    fileName: string;
    percent: number;
    direction: 'upload' | 'download';
}

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

export function WebClient() {
    // Lire le code depuis ?code= query parameter
    const [searchParams] = useSearchParams();
    const sessionCode = searchParams.get('code') || '';

    const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
    const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
    const [currentTransfer, setCurrentTransfer] = useState<TransferProgress | null>(null);
    const [completedTransfers, setCompletedTransfers] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Connect to WebSocket server
    useEffect(() => {
        if (!sessionCode) {
            setError('Code de session manquant. Veuillez scanner à nouveau le QR code.');
            setConnectionState('error');
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            // Authenticate with session code
            ws.send(JSON.stringify({ type: 'auth', sessionCode }));
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleMessage(message);
        };

        ws.onerror = () => {
            setConnectionState('error');
            setError('Erreur de connexion au serveur');
        };

        ws.onclose = () => {
            if (connectionState === 'connected') {
                setConnectionState('disconnected');
            }
        };

        return () => {
            ws.close();
        };
    }, [sessionCode]);

    const handleMessage = useCallback((message: { type: string;[key: string]: unknown }) => {
        switch (message.type) {
            case 'auth-success':
                setConnectionState('connected');
                break;

            case 'auth-failed':
                setConnectionState('error');
                setError(message.reason as string || 'Authentification échouée');
                break;

            case 'available-files':
                setAvailableFiles(message.files as AvailableFile[]);
                break;

            case 'file-start-ack':
                // Server acknowledged file start
                break;

            case 'file-chunk-ack':
                // Chunk received, continue sending
                break;

            case 'file-complete':
                setCurrentTransfer(null);
                setCompletedTransfers(prev => [...prev, message.savedAs as string]);
                break;

            case 'file-ready':
                // Download file via HTTP
                downloadFile(message.downloadUrl as string, message.fileName as string);
                break;

            case 'error':
                setError(message.message as string);
                setCurrentTransfer(null);
                break;
        }
    }, []);

    const downloadFile = (url: string, fileName: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setCompletedTransfers(prev => [...prev, fileName]);
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        await sendFile(file);

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const sendFile = async (file: File) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setError('Non connecté au serveur');
            return;
        }

        const ws = wsRef.current;
        const fileId = Math.random().toString(36).substring(2, 10);
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        // Start file transfer
        ws.send(JSON.stringify({
            type: 'file-start',
            payload: {
                fileId,
                fileName: file.name,
                fileSize: file.size,
                totalChunks,
            },
        }));

        setCurrentTransfer({ fileName: file.name, percent: 0, direction: 'upload' });

        // Read and send chunks
        const reader = new FileReader();
        let chunkIndex = 0;

        const sendNextChunk = () => {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1];

                ws.send(JSON.stringify({
                    type: 'file-chunk',
                    payload: {
                        fileId,
                        chunkIndex,
                        data: base64,
                    },
                }));

                const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
                setCurrentTransfer({ fileName: file.name, percent, direction: 'upload' });

                chunkIndex++;
                if (chunkIndex < totalChunks) {
                    // Add small delay to avoid overwhelming the connection
                    setTimeout(sendNextChunk, 10);
                } else {
                    // All chunks sent
                    ws.send(JSON.stringify({
                        type: 'file-end',
                        payload: { fileId },
                    }));
                }
            };

            reader.readAsDataURL(chunk);
        };

        sendNextChunk();
    };

    const requestFile = (fileId: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        wsRef.current.send(JSON.stringify({
            type: 'file-request',
            payload: { fileId },
        }));
    };

    // Error state
    if (connectionState === 'error') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900/30 to-slate-900 flex items-center justify-center p-6">
                <div className="text-center">
                    <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white mb-2">Connexion impossible</h1>
                    <p className="text-white/70 mb-4">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        Réessayer
                    </button>
                </div>
            </div>
        );
    }

    // Connecting state
    if (connectionState === 'connecting') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
                <div className="text-center">
                    <Loader2 className="w-16 h-16 text-purple-400 mx-auto mb-4 animate-spin" />
                    <h1 className="text-2xl font-bold text-white mb-2">Connexion...</h1>
                    <p className="text-white/70">Connexion au serveur WiFiShare</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
            {/* Header */}
            <header className="p-4 flex items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                        <Wifi className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="font-bold">WiFiShare</h1>
                        <p className="text-xs text-white/50">Connecté au PC</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 px-2 py-1 bg-green-500/20 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-green-400 text-xs">Connecté</span>
                </div>
            </header>

            <main className="p-4 space-y-6 max-w-lg mx-auto">
                {/* Connection Info */}
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-4 border border-white/10">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center">
                            <Smartphone className="w-8 h-8 text-purple-400" />
                            <div className="w-12 border-t-2 border-dashed border-purple-400/50 mx-2"></div>
                            <Monitor className="w-8 h-8 text-purple-400" />
                        </div>
                        <div>
                            <p className="font-medium">Connexion établie</p>
                            <p className="text-sm text-white/50">Session: {sessionCode}</p>
                        </div>
                    </div>
                </div>

                {/* Upload Section */}
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Upload className="w-5 h-5 text-purple-400" />
                        Envoyer vers le PC
                    </h2>

                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-input"
                    />

                    <label
                        htmlFor="file-input"
                        className="block w-full py-8 border-2 border-dashed border-white/20 hover:border-purple-500/50 rounded-xl cursor-pointer transition-colors text-center"
                    >
                        <Upload className="w-10 h-10 mx-auto mb-2 text-white/50" />
                        <p className="text-white/70">Toucher pour sélectionner un fichier</p>
                    </label>
                </div>

                {/* Transfer Progress */}
                {currentTransfer && (
                    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-4 border border-purple-500/50">
                        <div className="flex items-center gap-3 mb-3">
                            <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
                            <span className="font-medium">
                                {currentTransfer.direction === 'upload' ? 'Envoi en cours...' : 'Téléchargement...'}
                            </span>
                        </div>
                        <p className="text-sm text-white/70 truncate mb-2">{currentTransfer.fileName}</p>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                                style={{ width: `${currentTransfer.percent}%` }}
                            />
                        </div>
                        <p className="text-right text-sm text-white/50 mt-1">{currentTransfer.percent}%</p>
                    </div>
                )}

                {/* Completed Transfers */}
                {completedTransfers.length > 0 && (
                    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-4 border border-white/10">
                        <h3 className="text-sm font-medium text-white/70 mb-3">Transferts terminés</h3>
                        <div className="space-y-2">
                            {completedTransfers.map((fileName, index) => (
                                <div key={index} className="flex items-center gap-2 text-green-400">
                                    <CheckCircle className="w-4 h-4" />
                                    <span className="text-sm truncate">{fileName}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Available Files from PC */}
                {availableFiles.length > 0 && (
                    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Download className="w-5 h-5 text-purple-400" />
                            Fichiers disponibles
                        </h2>

                        <div className="space-y-2">
                            {availableFiles.map(file => (
                                <button
                                    key={file.id}
                                    onClick={() => requestFile(file.id)}
                                    className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <FileIcon className="w-5 h-5 text-purple-400" />
                                    <span className="flex-1 text-left truncate">{file.name}</span>
                                    <Download className="w-4 h-4 text-white/50" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
