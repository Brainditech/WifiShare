// ============================================================================
// WebClient - Interface mobile avec design Apple Premium
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
    Smartphone,
    Monitor,
    Loader2,
    Sparkles,
    Zap,
    ArrowUpRight
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
    const [searchParams] = useSearchParams();
    const sessionCode = searchParams.get('code') || '';

    const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
    const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
    const [currentTransfer, setCurrentTransfer] = useState<TransferProgress | null>(null);
    const [completedTransfers, setCompletedTransfers] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const connectionStateRef = useRef<ConnectionState>('connecting');

    useEffect(() => {
        connectionStateRef.current = connectionState;
    }, [connectionState]);

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
            case 'file-chunk-ack':
                break;
            case 'file-complete':
                setCurrentTransfer(null);
                setCompletedTransfers(prev => [...prev, message.savedAs as string]);
                break;
            case 'file-ready':
                downloadFile(message.downloadUrl as string, message.fileName as string);
                break;
            case 'pong':
                break;
            case 'error':
                setError(message.message as string);
                setCurrentTransfer(null);
                break;
        }
    }, []);

    useEffect(() => {
        if (!sessionCode) {
            setError('Code de session manquant');
            setConnectionState('error');
            return;
        }

        let ws: WebSocket | null = null;
        let pingInterval: ReturnType<typeof setInterval> | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

        const connect = () => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;

            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                ws?.send(JSON.stringify({ type: 'auth', sessionCode }));
                pingInterval = setInterval(() => {
                    if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 30000);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    handleMessage(message);
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            };

            ws.onerror = () => {
                console.error('WebSocket error');
            };

            ws.onclose = () => {
                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }
                if (connectionStateRef.current === 'connected') {
                    setConnectionState('disconnected');
                    reconnectTimeout = setTimeout(() => {
                        connect();
                    }, 2000);
                }
            };
        };

        connect();

        return () => {
            if (pingInterval) clearInterval(pingInterval);
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (ws) {
                ws.onclose = null;
                ws.close();
            }
        };
    }, [sessionCode, handleMessage]);

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
                    setTimeout(sendNextChunk, 10);
                } else {
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
            <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
                <div className="bg-gradient-mesh" />
                <div className="bg-noise" />

                <div className="text-center relative z-10 animate-scale-in">
                    <div className="relative mb-6">
                        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#FF3B30]/20 to-[#FF2D55]/20 flex items-center justify-center border border-[#FF3B30]/30">
                            <XCircle className="w-10 h-10 text-[#FF3B30]" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Connexion impossible</h1>
                    <p className="text-white/50 mb-6 max-w-xs mx-auto">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-8 py-3 bg-white/10 hover:bg-white/15 rounded-xl font-semibold transition-all duration-300 border border-white/10"
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
            <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
                <div className="bg-gradient-mesh" />
                <div className="bg-noise" />

                <div className="text-center relative z-10 animate-scale-in">
                    <div className="relative mb-6">
                        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#007AFF] to-[#AF52DE] flex items-center justify-center animate-pulse-soft">
                            <Loader2 className="w-10 h-10 text-white animate-spin" />
                        </div>
                        <div className="absolute inset-0 w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#007AFF] to-[#AF52DE] blur-2xl opacity-30" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Connexion...</h1>
                    <p className="text-white/50">Connexion au serveur WiFiShare</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen relative overflow-hidden safe-area-top safe-area-bottom">
            {/* Background */}
            <div className="bg-gradient-mesh" />
            <div className="bg-noise" />

            <div className="relative z-10">
                {/* Header */}
                <header className="sticky top-0 z-20 px-4 py-4 glass border-b border-white/10">
                    <div className="flex items-center justify-between max-w-lg mx-auto">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#007AFF] via-[#AF52DE] to-[#FF2D55] flex items-center justify-center shadow-lg">
                                <Wifi className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="font-bold text-white">WiFiShare</h1>
                                <p className="text-xs text-white/40">Connecté au PC</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#34C759]/10 border border-[#34C759]/20">
                            <div className="status-dot status-dot-success" />
                            <span className="text-[#34C759] text-xs font-semibold">En ligne</span>
                        </div>
                    </div>
                </header>

                <main className="p-4 space-y-5 max-w-lg mx-auto pb-8">
                    {/* Connection Info */}
                    <div className="glass-card p-5 animate-slide-up">
                        <div className="flex items-center justify-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#AF52DE]/20 to-[#FF2D55]/20 flex items-center justify-center border border-[#AF52DE]/20">
                                <Smartphone className="w-6 h-6 text-[#AF52DE]" />
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-12 border-t-2 border-dashed border-white/20" />
                                <Sparkles className="w-5 h-5 text-[#FF9500]" />
                                <div className="w-12 border-t-2 border-dashed border-white/20" />
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#007AFF]/20 to-[#5AC8FA]/20 flex items-center justify-center border border-[#007AFF]/20">
                                <Monitor className="w-6 h-6 text-[#007AFF]" />
                            </div>
                        </div>
                        <div className="text-center">
                            <p className="font-semibold text-white">Connexion établie</p>
                            <p className="text-sm text-white/40 font-mono">Session: {sessionCode}</p>
                        </div>
                    </div>

                    {/* Upload Section */}
                    <div className="glass-card p-6 animate-slide-up stagger-1">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#007AFF]/20 to-[#5AC8FA]/20 flex items-center justify-center border border-[#007AFF]/20">
                                <Upload className="w-5 h-5 text-[#007AFF]" />
                            </div>
                            <h2 className="text-lg font-semibold text-white">Envoyer vers le PC</h2>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="file-input"
                        />

                        <label
                            htmlFor="file-input"
                            className="block w-full py-10 border-2 border-dashed border-white/15 hover:border-[#007AFF]/50 rounded-2xl cursor-pointer transition-all duration-300 text-center group hover:bg-white/5"
                        >
                            <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center group-hover:from-[#007AFF]/20 group-hover:to-[#5AC8FA]/20 transition-all duration-300">
                                <Upload className="w-7 h-7 text-white/30 group-hover:text-[#007AFF] transition-colors" />
                            </div>
                            <p className="text-white/50 font-medium group-hover:text-white/70 transition-colors">
                                Toucher pour sélectionner
                            </p>
                            <p className="text-white/30 text-sm mt-1">Photos, vidéos, documents...</p>
                        </label>
                    </div>

                    {/* Transfer Progress */}
                    {currentTransfer && (
                        <div className="glass-card p-5 border-[#007AFF]/30 animate-scale-in">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#007AFF]/20 to-[#5AC8FA]/20 flex items-center justify-center border border-[#007AFF]/20 animate-pulse-soft">
                                    <Zap className="w-5 h-5 text-[#007AFF]" />
                                </div>
                                <span className="font-semibold text-white">
                                    {currentTransfer.direction === 'upload' ? 'Envoi en cours...' : 'Téléchargement...'}
                                </span>
                            </div>
                            <p className="text-sm text-white/50 truncate mb-3">{currentTransfer.fileName}</p>
                            <div className="progress-bar">
                                <div
                                    className="progress-bar-fill"
                                    style={{ width: `${currentTransfer.percent}%` }}
                                />
                            </div>
                            <p className="text-right text-sm text-[#007AFF] font-semibold mt-2">{currentTransfer.percent}%</p>
                        </div>
                    )}

                    {/* Completed Transfers */}
                    {completedTransfers.length > 0 && (
                        <div className="glass-card p-5 animate-slide-up stagger-2">
                            <h3 className="text-sm font-semibold text-white/50 mb-3">Transferts terminés</h3>
                            <div className="space-y-2">
                                {completedTransfers.slice(-5).map((fileName, index) => (
                                    <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-[#34C759]/10 border border-[#34C759]/20">
                                        <CheckCircle className="w-5 h-5 text-[#34C759]" />
                                        <span className="text-sm text-white truncate flex-1">{fileName}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Available Files from PC */}
                    {availableFiles.length > 0 && (
                        <div className="glass-card p-6 animate-slide-up stagger-3">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#AF52DE]/20 to-[#FF2D55]/20 flex items-center justify-center border border-[#AF52DE]/20">
                                    <Download className="w-5 h-5 text-[#AF52DE]" />
                                </div>
                                <h2 className="text-lg font-semibold text-white">Fichiers disponibles</h2>
                            </div>

                            <div className="space-y-2">
                                {availableFiles.map(file => (
                                    <button
                                        key={file.id}
                                        onClick={() => requestFile(file.id)}
                                        className="file-item w-full"
                                    >
                                        <div className="file-icon">
                                            <FileIcon className="w-5 h-5 text-[#AF52DE]" />
                                        </div>
                                        <span className="flex-1 text-left text-white truncate">{file.name}</span>
                                        <ArrowUpRight className="w-5 h-5 text-white/30" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
