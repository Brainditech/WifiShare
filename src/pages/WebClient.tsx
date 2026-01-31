// ============================================================================
// WebClient - Soft UI Mobile Design
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Wifi,
    Upload,
    Download,
    CheckCircle,
    XCircle,
    Monitor,
    Loader2,
    ArrowRight,
    Zap
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
            case 'file-complete':
                setCurrentTransfer(null);
                setCompletedTransfers(prev => [...prev, message.savedAs as string]);
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
        setCompletedTransfers(prev => [...prev, fileName]);
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

    if (connectionState === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F6FA]">
                <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
                        <XCircle className="w-10 h-10 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Connection Failed</h1>
                    <p className="text-gray-500 mb-8">{error}</p>
                    <button onClick={() => window.location.reload()} className="btn btn-primary w-full max-w-xs">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (connectionState === 'connecting') {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F6FA]">
                <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-6 bg-white rounded-full shadow-lg flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-black animate-spin" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900">Connecting...</h1>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F5F6FA] pb-safe-bottom">
            {/* Header */}
            <header className="px-6 pt-8 pb-6 bg-white rounded-b-[32px] shadow-sm sticky top-0 z-10">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                            <Wifi className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-lg">WiFiShare</span>
                    </div>
                    <div className="status-pill text-xs">
                        <div className="dot dot-success animate-pulse"></div>
                        <span>Online</span>
                    </div>
                </div>
            </header>

            <main className="p-6 space-y-6">

                {/* Connection Status Card */}
                <div className="bento-card bento-card-purple flex items-center justify-between p-6">
                    <div>
                        <p className="text-purple-900/60 font-semibold text-xs uppercase mb-1">CONNECTED TO</p>
                        <h2 className="text-xl font-bold text-purple-900">Desktop App</h2>
                    </div>
                    <div className="w-12 h-12 bg-white/50 rounded-full flex items-center justify-center">
                        <Monitor className="w-6 h-6 text-purple-700" />
                    </div>
                </div>

                {/* Upload Section */}
                <div>
                    <h3 className="heading-lg mb-4 text-xl">Select File</h3>
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="mobile-upload"
                    />
                    <label
                        htmlFor="mobile-upload"
                        className="bento-card bg-white active:scale-95 cursor-pointer flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 hover:border-black transition-all"
                    >
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                            <Upload className="w-8 h-8 text-black" />
                        </div>
                        <p className="font-bold text-lg">Tap to Upload</p>
                        <p className="text-gray-400 text-sm">Photos, Videos, Docs</p>
                    </label>
                </div>

                {/* Downloads Section */}
                {(completedTransfers.length > 0 || availableFiles.length > 0) && (
                    <div>
                        <h3 className="heading-lg mb-4 text-xl">Files</h3>

                        {/* Completed Transfers */}
                        {completedTransfers.map((fileName, idx) => (
                            <div key={`comp-${idx}`} className="file-row">
                                <div className="icon-box bg-green-100 text-green-600">
                                    <CheckCircle className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate">{fileName}</p>
                                    <p className="text-xs text-green-600 font-medium">Completed</p>
                                </div>
                            </div>
                        ))}

                        {/* Available Files */}
                        {availableFiles.map((file) => (
                            <div
                                key={file.id}
                                onClick={() => requestFile(file.id)}
                                className="file-row active:bg-gray-100"
                            >
                                <div className="icon-box bg-blue-100 text-blue-600">
                                    <Download className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate">{file.name}</p>
                                    <p className="text-xs text-gray-400 font-medium">Tap to download</p>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-300" />
                            </div>
                        ))}
                    </div>
                )}

            </main>

            {/* Sticky Transfer Progress */}
            {currentTransfer && (
                <div className="fixed bottom-6 left-4 right-4 bg-black text-white p-4 rounded-3xl shadow-2xl flex items-center gap-4 z-50 animate-float">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-yellow-400 fill-current" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-1">
                            <span className="font-bold text-sm truncate max-w-[150px]">{currentTransfer.fileName}</span>
                            <span className="font-mono text-xs opacity-70">{currentTransfer.percent}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-white rounded-full transition-all duration-300"
                                style={{ width: `${currentTransfer.percent}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
