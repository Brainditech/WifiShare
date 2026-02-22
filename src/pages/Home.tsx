// ============================================================================
// WiFiShare - Page Home (Version améliorée)
// Interface unifiée avec connexion persistante et scanner QR
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Download, Wifi, Copy, Check, FileText, Upload, ArrowLeft, Camera, RefreshCw } from 'lucide-react';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { FileDropZone } from '../components/FileDropZone';
import { QRScanner } from '../components/QRScanner';
import { peerService } from '../services/peerService';

type Mode = 'menu' | 'receive' | 'send-connect' | 'send-files' | 'transferring' | 'complete';

interface ReceivedFile {
    name: string;
    size: number;
}

export function Home() {
    const [mode, setMode] = useState<Mode>('menu');
    const [peerId, setPeerId] = useState<string>('');
    const [inputCode, setInputCode] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string>('');
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    // Files
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [incomingFiles, setIncomingFiles] = useState<{ name: string; size: number }[]>([]);
    const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
    const [sentFilesCount, setSentFilesCount] = useState(0);
    const [progress, setProgress] = useState(0);

    const filesRef = useRef<File[]>([]);

    useEffect(() => {
        filesRef.current = selectedFiles;
    }, [selectedFiles]);

    // Initialize peer service with callbacks
    const initializePeer = useCallback(async () => {
        try {
            setIsConnecting(true);
            setError('');

            peerService.setOnConnected(() => {
                console.log('✅ Peer connected!');
                setIsConnected(true);
                setIsConnecting(false);
            });

            peerService.setOnDisconnected(() => {
                console.log('🔌 Peer disconnected');
                setIsConnected(false);
            });

            peerService.setOnFilesIncoming((files) => {
                console.log('📦 Files incoming:', files);
                setIncomingFiles(files);
                setMode('transferring');
            });

            peerService.setOnFileStart((fileIdx, fileName) => {
                console.log(`📄 Receiving file ${fileIdx}: ${fileName}`);
            });

            peerService.setOnProgress((_fileIdx, fileProgress) => {
                setProgress(fileProgress);
            });

            peerService.setOnFileComplete((_fileIdx, fileName, blob) => {
                console.log(`✅ File complete: ${fileName}`);
                setReceivedFiles(prev => [...prev, { name: fileName, size: blob.size }]);

                // Auto-download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });

            peerService.setOnTransferComplete(() => {
                console.log('🎉 Transfer complete!');
                setMode('complete');
            });

            peerService.setOnError((err) => {
                console.error('❌ Error:', err);
                setError(err);
                setIsConnecting(false);
            });

            const id = await peerService.initialize();
            setPeerId(id);
            setIsConnecting(false);
            return id;
        } catch (err) {
            setError('Impossible de se connecter au serveur');
            setIsConnecting(false);
            throw err;
        }
    }, []);

    // Start receiving mode
    const startReceiving = async () => {
        setMode('receive');
        setReceivedFiles([]);
        await initializePeer();
    };

    // Start sending mode
    const startSending = () => {
        setMode('send-connect');
        setError('');
        setSelectedFiles([]);
        setSentFilesCount(0);
    };

    // Connect to receiver
    const connectToReceiver = async () => {
        if (inputCode.length < 6) {
            setError('Code invalide');
            return;
        }

        try {
            setIsConnecting(true);
            setError('');
            await initializePeer();
            await peerService.connectTo(inputCode.toUpperCase());
            setMode('send-files');
        } catch {
            setError('Impossible de se connecter. Vérifiez le code.');
            setIsConnecting(false);
        }
    };

    // Handle QR scan result - connect directly
    const handleQRScan = async (code: string) => {
        console.log('📱 QR Scanned, connecting to:', code);
        setShowScanner(false);
        setInputCode(code);

        // Connect directly
        try {
            setIsConnecting(true);
            setError('');
            await initializePeer();
            console.log('✅ Peer initialized, connecting to receiver...');
            await peerService.connectTo(code.toUpperCase());
            console.log('✅ Connected! Switching to send-files mode');
            setIsConnecting(false);
            setMode('send-files');
        } catch (err) {
            console.error('❌ Connection failed:', err);
            setError('Impossible de se connecter. Vérifiez le code.');
            setIsConnecting(false);
        }
    };

    // Send selected files
    const sendFiles = async () => {
        if (filesRef.current.length === 0) return;

        setMode('transferring');
        setProgress(0);

        try {
            const filesToSend = [...filesRef.current];
            await peerService.sendFiles(filesToSend, (_fileIndex, fileProgress) => {
                setProgress(fileProgress);
            });
            setSentFilesCount(filesToSend.length);
            setMode('complete');
        } catch {
            setError('Erreur pendant le transfert');
            setMode('send-files');
        }
    };

    // Send more files (stay connected)
    const sendMoreFiles = () => {
        setSelectedFiles([]);
        setProgress(0);
        setMode('send-files');
    };

    // Stay ready for more files (receiver)
    const receiveMoreFiles = () => {
        setReceivedFiles([]);
        setIncomingFiles([]);
        setProgress(0);
        setMode('receive');
    };

    const copyCode = async () => {
        await navigator.clipboard.writeText(peerId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const goBack = () => {
        peerService.destroy();
        setMode('menu');
        setPeerId('');
        setInputCode('');
        setError('');
        setIsConnected(false);
        setSelectedFiles([]);
        setIncomingFiles([]);
        setReceivedFiles([]);
        setProgress(0);
        setSentFilesCount(0);
    };

    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 safe-area-top safe-area-bottom">
            {/* QR Scanner Modal */}
            {showScanner && (
                <QRScanner
                    onScan={handleQRScan}
                    onClose={() => setShowScanner(false)}
                />
            )}

            {/* Header */}
            <header className="px-6 pt-8 pb-6">
                <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-fuchsia-500 flex items-center justify-center">
                        <Wifi className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">WiFiShare</h1>
                </div>
                <p className="text-center text-slate-400 text-sm">
                    Transfert P2P sécurisé
                </p>
            </header>

            <main className="px-6 pb-8">
                {/* Menu */}
                {mode === 'menu' && (
                    <div className="space-y-4 animate-slide-up">
                        <button onClick={startSending} className="w-full btn btn-primary py-6 text-lg">
                            <Send className="w-6 h-6" />
                            Envoyer des fichiers
                        </button>

                        <button onClick={startReceiving} className="w-full btn btn-secondary py-6 text-lg">
                            <Download className="w-6 h-6" />
                            Recevoir des fichiers
                        </button>
                    </div>
                )}

                {/* Receive Mode */}
                {mode === 'receive' && (
                    <div className="space-y-6 animate-slide-up">
                        <button onClick={goBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1">
                            <ArrowLeft className="w-4 h-4" /> Retour
                        </button>

                        {isConnecting && (
                            <div className="flex flex-col items-center py-12">
                                <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <p className="text-slate-400">Connexion au serveur...</p>
                            </div>
                        )}

                        {peerId && !isConnecting && (
                            <>
                                <div className="card p-6 flex flex-col items-center">
                                    <QRCodeDisplay
                                        value={peerId}
                                        title="Code de connexion"
                                        subtitle="Scannez ou entrez ce code"
                                    />
                                </div>

                                <div className="card p-4">
                                    <h3 className="text-sm text-slate-400 mb-3">Code à partager</h3>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 bg-slate-800 px-4 py-4 rounded-xl text-white font-mono text-center text-3xl tracking-widest">
                                            {peerId}
                                        </code>
                                        <button onClick={copyCode} className="btn btn-ghost p-3">
                                            {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="card p-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></div>
                                        <span className={isConnected ? 'text-green-400' : 'text-slate-400'}>
                                            {isConnected ? 'Appareil connecté !' : 'En attente de connexion...'}
                                        </span>
                                    </div>
                                </div>
                            </>
                        )}

                        {error && (
                            <div className="card p-4 bg-red-500/10 border border-red-500/30">
                                <p className="text-red-400 text-center">{error}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Send - Connect */}
                {mode === 'send-connect' && (
                    <div className="space-y-6 animate-slide-up">
                        <button onClick={goBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1">
                            <ArrowLeft className="w-4 h-4" /> Retour
                        </button>

                        <div className="card p-6">
                            <h2 className="text-lg font-semibold text-white mb-4">Connectez-vous</h2>

                            {/* Scanner button */}
                            <button
                                onClick={() => setShowScanner(true)}
                                className="w-full btn btn-secondary py-4 mb-4"
                            >
                                <Camera className="w-5 h-5" />
                                Scanner le QR code
                            </button>

                            <div className="relative my-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-700"></div>
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="bg-slate-800 px-3 text-slate-400 text-sm">ou</span>
                                </div>
                            </div>

                            <p className="text-slate-400 text-sm mb-4">
                                Entrez le code affiché sur l'autre appareil
                            </p>

                            <input
                                type="text"
                                value={inputCode}
                                onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
                                placeholder="ABC123"
                                className="input text-center font-mono text-3xl tracking-widest mb-4"
                                maxLength={6}
                                autoComplete="off"
                            />

                            {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

                            <button
                                onClick={connectToReceiver}
                                disabled={isConnecting || inputCode.length < 6}
                                className="w-full btn btn-primary py-4"
                            >
                                {isConnecting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Connexion...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-5 h-5" />
                                        Se connecter
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Send - Files */}
                {mode === 'send-files' && (
                    <div className="space-y-6 animate-slide-up">
                        <button onClick={goBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1">
                            <ArrowLeft className="w-4 h-4" /> Retour
                        </button>

                        <div className="card p-4 bg-green-500/10 border border-green-500/30">
                            <div className="flex items-center gap-3">
                                <Check className="w-5 h-5 text-green-400" />
                                <span className="text-green-400">Connecté à {inputCode}</span>
                            </div>
                        </div>

                        <FileDropZone onFilesSelected={setSelectedFiles} maxFiles={10} />

                        {selectedFiles.length > 0 && (
                            <>
                                <div className="card p-4">
                                    <h3 className="text-sm text-white mb-3">Fichiers ({selectedFiles.length})</h3>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {selectedFiles.map((file, i) => (
                                            <div key={i} className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg">
                                                <FileText className="w-4 h-4 text-sky-400" />
                                                <span className="text-white text-sm truncate flex-1">{file.name}</span>
                                                <span className="text-slate-500 text-xs">{formatSize(file.size)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <button onClick={sendFiles} className="w-full btn btn-primary py-4">
                                    <Upload className="w-5 h-5" />
                                    Envoyer {selectedFiles.length} fichier(s)
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Transferring */}
                {mode === 'transferring' && (
                    <div className="space-y-6 animate-slide-up">
                        <div className="card p-6">
                            <h2 className="text-lg font-semibold text-white mb-4">Transfert en cours...</h2>

                            <div className="mb-6">
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-400">Progression</span>
                                    <span className="text-white">{Math.round(progress)}%</span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-3">
                                    <div
                                        className="bg-gradient-to-r from-sky-500 to-fuchsia-500 h-3 rounded-full transition-all"
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                            </div>

                            {incomingFiles.length > 0 && (
                                <div className="space-y-2">
                                    {incomingFiles.map((file, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                                            <FileText className="w-5 h-5 text-sky-400" />
                                            <span className="text-white text-sm truncate">{file.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Complete */}
                {mode === 'complete' && (
                    <div className="space-y-6 animate-slide-up">
                        <div className="card p-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                <Check className="w-8 h-8 text-green-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Transfert terminé !</h2>
                            <p className="text-slate-400 mb-6">
                                {sentFilesCount > 0
                                    ? `${sentFilesCount} fichier(s) envoyé(s)`
                                    : `${receivedFiles.length} fichier(s) reçu(s)`
                                }
                            </p>

                            {receivedFiles.length > 0 && (
                                <div className="text-left mb-6">
                                    <h3 className="text-sm text-slate-400 mb-2">Fichiers téléchargés :</h3>
                                    <div className="space-y-2">
                                        {receivedFiles.map((file, i) => (
                                            <div key={i} className="flex items-center gap-2 p-2 bg-slate-800/50 rounded">
                                                <Check className="w-4 h-4 text-green-400" />
                                                <span className="text-white text-sm">{file.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Stay connected buttons */}
                            <div className="space-y-3">
                                {sentFilesCount > 0 ? (
                                    <button onClick={sendMoreFiles} className="w-full btn btn-primary">
                                        <RefreshCw className="w-5 h-5" />
                                        Envoyer d'autres fichiers
                                    </button>
                                ) : (
                                    <button onClick={receiveMoreFiles} className="w-full btn btn-primary">
                                        <RefreshCw className="w-5 h-5" />
                                        Recevoir d'autres fichiers
                                    </button>
                                )}

                                <button onClick={goBack} className="w-full btn btn-ghost">
                                    Terminé
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
