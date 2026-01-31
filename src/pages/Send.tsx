// ============================================================================
// WiFiShare - Page Send (Version avec WebSocket corrigée)
// Page d'envoi de fichiers avec transfert temps réel
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Send, ArrowLeft, Check, AlertCircle, FileText, Upload } from 'lucide-react';
import { FileDropZone } from '../components/FileDropZone';
import { wsClient } from '../services/wsClient';

interface LocationState {
    sessionCode?: string;
}

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

export function SendPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const state = location.state as LocationState | null;

    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error'>('connected');
    const [error, setError] = useState<string>('');
    const [transferring, setTransferring] = useState(false);
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [transferComplete, setTransferComplete] = useState(false);

    // Use ref to avoid closure issues
    const filesRef = useRef<File[]>([]);
    const isTransferringRef = useRef(false);

    // Keep ref in sync with state
    useEffect(() => {
        filesRef.current = selectedFiles;
    }, [selectedFiles]);

    const startTransfer = useCallback(async () => {
        const files = filesRef.current;

        if (files.length === 0) {
            console.error('No files to transfer');
            return;
        }

        if (isTransferringRef.current) {
            console.log('Transfer already in progress');
            return;
        }

        isTransferringRef.current = true;
        console.log(`📤 Starting transfer of ${files.length} files`);

        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
            setCurrentFileIndex(fileIndex);
            const file = files[fileIndex];
            console.log(`📄 Sending file ${fileIndex + 1}/${files.length}: ${file.name} (${file.size} bytes)`);

            // Read file as array buffer
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            // Split into chunks
            const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);
            console.log(`📦 File split into ${totalChunks} chunks`);

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, bytes.length);
                const chunk = bytes.slice(start, end);

                // Convert to base64
                const base64 = btoa(String.fromCharCode(...chunk));

                // Send chunk
                wsClient.sendChunk(fileIndex, chunkIndex, totalChunks, base64, file.name);

                // Update progress
                const overallProgress = ((fileIndex * totalChunks + chunkIndex + 1) / (files.length * totalChunks)) * 100;
                setProgress(overallProgress);

                // Small delay to prevent overwhelming the connection
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Notify file complete
            console.log(`✅ File complete: ${file.name}`);
            wsClient.fileComplete(fileIndex, file.name);
        }

        // Notify transfer complete
        console.log('🎉 All transfers complete!');
        wsClient.transferComplete();
        setTransferComplete(true);
        setTransferring(false);
        isTransferringRef.current = false;
    }, []);

    useEffect(() => {
        if (!state?.sessionCode) {
            navigate('/');
            return;
        }

        console.log(`📱 Send page loaded with session: ${state.sessionCode}`);

        // Subscribe to files accepted
        const unsubAccepted = wsClient.on('FILES_ACCEPTED', () => {
            console.log('✅ Files accepted by receiver, starting transfer...');
            startTransfer();
        });

        // Subscribe to chunk acknowledgments
        const unsubAck = wsClient.on('CHUNK_ACK', (msg) => {
            // Log every 10th chunk to avoid spam
            if (msg.chunkIndex % 10 === 0) {
                console.log(`📨 Chunk ${msg.chunkIndex} acknowledged for file ${msg.fileIndex}`);
            }
        });

        // Subscribe to receiver disconnected
        const unsubDisconnect = wsClient.on('RECEIVER_DISCONNECTED', () => {
            console.log('❌ Receiver disconnected');
            setError('Le destinataire s\'est déconnecté');
            setConnectionStatus('error');
            setTransferring(false);
            isTransferringRef.current = false;
        });

        return () => {
            unsubAccepted();
            unsubAck();
            unsubDisconnect();
        };
    }, [state, navigate, startTransfer]);

    const handleFilesSelected = (files: File[]) => {
        console.log(`📁 Files selected: ${files.map(f => f.name).join(', ')}`);
        setSelectedFiles(files);
    };

    const handleSend = async () => {
        if (selectedFiles.length === 0) return;

        console.log(`📤 Announcing ${selectedFiles.length} files to receiver`);
        setTransferring(true);
        setProgress(0);

        // Announce files to receiver
        const fileInfo = selectedFiles.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type || 'application/octet-stream'
        }));

        wsClient.sendFiles(fileInfo);
    };

    const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 safe-area-top safe-area-bottom">
            {/* Header */}
            <header className="px-6 pt-8 pb-6">
                <button
                    onClick={() => {
                        wsClient.disconnect();
                        navigate('/');
                    }}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Retour</span>
                </button>

                <h1 className="text-2xl font-bold text-white">Envoyer des fichiers</h1>

                {/* Connection status */}
                <div className="mt-4 flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl">
                    {connectionStatus === 'connected' && (
                        <>
                            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                                <Check className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <p className="text-sm text-green-400">Connecté</p>
                                <p className="text-white font-medium font-mono">{state?.sessionCode}</p>
                            </div>
                        </>
                    )}

                    {connectionStatus === 'error' && (
                        <>
                            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <p className="text-sm text-red-400">Erreur</p>
                                <p className="text-white font-medium">{error}</p>
                            </div>
                        </>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="px-6 pb-24 space-y-6">
                {/* Transfer Complete */}
                {transferComplete && (
                    <div className="card p-6 text-center animate-slide-up">
                        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                            <Check className="w-8 h-8 text-green-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Transfert terminé !</h2>
                        <p className="text-slate-400 mb-4">
                            {selectedFiles.length} fichier(s) envoyé(s) avec succès
                        </p>
                        <button
                            onClick={() => {
                                wsClient.disconnect();
                                navigate('/');
                            }}
                            className="btn btn-primary"
                        >
                            Terminé
                        </button>
                    </div>
                )}

                {/* Transferring */}
                {transferring && (
                    <div className="card p-6 animate-slide-up">
                        <h2 className="text-lg font-semibold text-white mb-4">Envoi en cours...</h2>

                        {/* Overall progress */}
                        <div className="mb-6">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-slate-400">Progression totale</span>
                                <span className="text-white font-medium">{Math.round(progress)}%</span>
                            </div>
                            <div className="w-full bg-slate-700 rounded-full h-3">
                                <div
                                    className="bg-gradient-to-r from-sky-500 to-fuchsia-500 h-3 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Current file */}
                        {selectedFiles[currentFileIndex] && (
                            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                                <FileText className="w-5 h-5 text-sky-400" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm truncate">{selectedFiles[currentFileIndex].name}</p>
                                    <p className="text-slate-500 text-xs">
                                        Fichier {currentFileIndex + 1} sur {selectedFiles.length}
                                    </p>
                                </div>
                                <Upload className="w-4 h-4 text-sky-400 animate-pulse" />
                            </div>
                        )}
                    </div>
                )}

                {/* File Selection */}
                {!transferring && !transferComplete && (
                    <>
                        <FileDropZone
                            onFilesSelected={handleFilesSelected}
                            maxFiles={10}
                        />

                        {/* Selected files list */}
                        {selectedFiles.length > 0 && (
                            <div className="card p-4">
                                <h3 className="text-sm font-medium text-white mb-3">
                                    Fichiers sélectionnés ({selectedFiles.length})
                                </h3>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {selectedFiles.map((file, index) => (
                                        <div key={index} className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg">
                                            <FileText className="w-4 h-4 text-sky-400" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm truncate">{file.name}</p>
                                                <p className="text-slate-500 text-xs">{formatSize(file.size)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Send Button */}
                        {selectedFiles.length > 0 && (
                            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent">
                                <button
                                    onClick={handleSend}
                                    className="w-full btn btn-primary py-4"
                                >
                                    <Send className="w-5 h-5" />
                                    Envoyer {selectedFiles.length} fichier(s) ({formatSize(totalSize)})
                                </button>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
