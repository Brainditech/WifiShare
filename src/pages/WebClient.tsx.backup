// ============================================================================
// WebClient - Syncra Dark Mobile
// Minimalist, Dark, Centered
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Wifi,
    Upload,
    Download,
    XCircle,
    Monitor,
    Loader2,
    ArrowRight
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

const CHUNK_SIZE = 64 * 1024;

export function WebClient() {
    const [searchParams] = useSearchParams();
    const sessionCode = searchParams.get('code') || '';

    const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
    const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
    const [currentTransfer, setCurrentTransfer] = useState<TransferProgress | null>(null);
    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const connectionStateRef = useRef<ConnectionState>('connecting');

    // ... (Logique identique à l'originale pour la connexion et le transfert)
    // JE COPIE COLE LA LOGIQUE EXISTANTE POUR EVITER DE CASER LA FONCTIONNALITE

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
                setError(message.reason as string || 'Authentication failed');
                break;
            case 'available-files':
                setAvailableFiles(message.files as AvailableFile[]);
                break;
            case 'file-complete':
                setCurrentTransfer(null);
                break;
            case 'file-ready':
                downloadFile(message.downloadUrl as string, message.fileName as string);
                break;
            case 'error':
                setError(message.message as string);
                setCurrentTransfer(null);
                break;
        }
    }, []);

    useEffect(() => {
        if (!sessionCode) {
            setError('Missing session code');
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

            ws.onclose = () => {
                if (pingInterval) clearInterval(pingInterval);
                if (connectionStateRef.current === 'connected') {
                    setConnectionState('disconnected');
                    reconnectTimeout = setTimeout(connect, 2000);
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
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        await sendFile(files[0]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const sendFile = async (file: File) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setError('Not connected');
            return;
        }

        const ws = wsRef.current;
        const fileId = Math.random().toString(36).substring(2, 10);
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        ws.send(JSON.stringify({
            type: 'file-start',
            payload: { fileId, fileName: file.name, fileSize: file.size, totalChunks },
        }));

        setCurrentTransfer({ fileName: file.name, percent: 0, direction: 'upload' });

        const reader = new FileReader();
        let chunkIndex = 0;

        const sendNextChunk = () => {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);

            reader.onload = () => {
                const base64 = (reader.result as string).split(',')[1];
                ws.send(JSON.stringify({
                    type: 'file-chunk',
                    payload: { fileId, chunkIndex, data: base64 },
                }));

                const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
                setCurrentTransfer({ fileName: file.name, percent, direction: 'upload' });

                chunkIndex++;
                if (chunkIndex < totalChunks) {
                    setTimeout(sendNextChunk, 10);
                } else {
                    ws.send(JSON.stringify({ type: 'file-end', payload: { fileId } }));
                }
            };

            reader.readAsDataURL(file.slice(start, end));
        };

        sendNextChunk();
    };

    const requestFile = (fileId: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ type: 'file-request', payload: { fileId } }));
    };

    // --- RENDER ---

    if (connectionState === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-black text-white">
                <div className="text-center max-w-xs">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold mb-2">Connection Issue</h1>
                    <p className="text-white/40 text-sm mb-8 leading-relaxed">{error}</p>
                    <button onClick={() => window.location.reload()} className="btn-syncra w-full">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (connectionState === 'connecting') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-black">
                <div className="relative w-20 h-20 mb-8 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500/20"></div>
                    <div className="absolute inset-0 rounded-full border-t-2 border-purple-500 animate-spin"></div>
                    <Loader2 className="w-8 h-8 text-white animate-pulse" />
                </div>
                <h1 className="text-lg font-bold text-white mb-2">Syncra Share</h1>
                <p className="text-white/30 text-xs tracking-widest uppercase">Connecting to Desktop...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white pb-safe-bottom">
            {/* Ambient Background */}
            <div className="fixed top-[-20%] right-[-20%] w-[300px] h-[300px] bg-purple-900/30 rounded-full blur-[80px] pointer-events-none" />

            {/* Header */}
            <header className="px-6 py-8 flex items-center justify-center relative">
                <div className="absolute left-6 top-8 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                    <Wifi className="w-5 h-5 text-white/70" />
                </div>
                <h1 className="text-lg font-bold tracking-wide">Connected</h1>
                <div className="absolute right-6 top-8">
                    <div className="w-2 h-2 rounded-full bg-[#00FF94] shadow-[0_0_10px_#00FF94] animate-pulse"></div>
                </div>
            </header>

            <main className="px-6 py-4 flex flex-col h-full gap-8">

                {/* Main Visual */}
                <div className="flex flex-col items-center justify-center py-8">
                    <div className="relative w-40 h-40 flex items-center justify-center mb-6">
                        {/* Ripples */}
                        <div className="absolute inset-0 rounded-full border border-purple-500/20 animate-ping opacity-20" style={{ animationDuration: '3s' }}></div>
                        <div className="absolute inset-4 rounded-full border border-purple-500/30 animate-ping opacity-20" style={{ animationDuration: '3s', animationDelay: '0.5s' }}></div>

                        {/* Core */}
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 shadow-[0_0_30px_rgba(157,0,255,0.4)] flex items-center justify-center relative z-10">
                            <Monitor className="w-10 h-10 text-white" />
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        Ready to Transfer
                    </h2>
                    <p className="text-white/40 text-sm mt-2 max-w-[200px] text-center">
                        Tap below to send files to the connected desktop
                    </p>
                </div>

                {/* Main Action */}
                <div className="flex-1 flex flex-col justify-end gap-6 max-w-sm mx-auto w-full">
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="mobile-upload"
                    />

                    <label
                        htmlFor="mobile-upload"
                        className="btn-syncra w-full py-5 text-lg flex items-center justify-center gap-3 cursor-pointer active:scale-95 transition-transform"
                    >
                        <Upload className="w-6 h-6" />
                        Send File
                    </label>

                    {/* Available Files Section */}
                    {(availableFiles.length > 0) && (
                        <div className="space-y-4 pt-4 border-t border-white/5">
                            <h3 className="text-white/40 text-xs font-bold uppercase tracking-widest text-center">Available Downloads</h3>
                            <div className="space-y-3">
                                {availableFiles.map((file) => (
                                    <div
                                        key={file.id}
                                        onClick={() => requestFile(file.id)}
                                        className="file-item-dark"
                                    >
                                        <div className="icon-box-dark !w-10 !h-10 !mr-4">
                                            <Download className="w-5 h-5" />
                                        </div>
                                        <span className="flex-1 text-sm font-medium truncate">{file.name}</span>
                                        <ArrowRight className="w-4 h-4 text-white/30" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Transfer Progress Bar Overlay */}
            {currentTransfer && (
                <div className="fixed inset-x-4 bottom-8 bg-[#1a1a1a] border border-purple-500/30 rounded-2xl p-4 shadow-2xl z-50 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{currentTransfer.direction === 'upload' ? 'Sending...' : 'Receiving...'}</span>
                        <span className="text-xs font-mono text-purple-400">{currentTransfer.percent}%</span>
                    </div>
                    <p className="text-sm font-bold text-white truncate mb-3">{currentTransfer.fileName}</p>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-200"
                            style={{ width: `${currentTransfer.percent}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
