// ============================================================================
// DesktopHome - Vue principale pour l'application Desktop
// Affiche le QR code, les clients connectés et les transferts
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
    Wifi,
    FolderOpen,
    Users,
    FileUp,
    CheckCircle,
    Copy,
    RefreshCw,
    Download,
    Smartphone
} from 'lucide-react';

interface ServerInfo {
    ip: string;
    port: number;
    sessionCode: string;
    url: string;
}

interface ReceivedFile {
    name: string;
    path: string;
    timestamp: Date;
}

interface ConnectedClient {
    id: string;
}

interface TransferProgress {
    fileName: string;
    percent: number;
}

export function DesktopHome() {
    const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
    const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
    const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>([]);
    const [currentTransfer, setCurrentTransfer] = useState<TransferProgress | null>(null);
    const [copied, setCopied] = useState(false);
    const [downloadsPath, setDownloadsPath] = useState<string>('');

    useEffect(() => {
        // Get server info from Electron
        const loadServerInfo = async () => {
            if (window.electronAPI) {
                const info = await window.electronAPI.getServerInfo();
                setServerInfo(info);

                const path = await window.electronAPI.getDownloadsPath();
                setDownloadsPath(path);
            }
        };

        loadServerInfo();

        // Setup event listeners
        if (window.electronAPI) {
            const unsubFile = window.electronAPI.onFileReceived((file) => {
                setReceivedFiles(prev => [...prev, { ...file, timestamp: new Date() }]);
                setCurrentTransfer(null);
            });

            const unsubConnect = window.electronAPI.onClientConnected((client) => {
                setConnectedClients(prev => [...prev, client]);
            });

            const unsubDisconnect = window.electronAPI.onClientDisconnected((client) => {
                setConnectedClients(prev => prev.filter(c => c.id !== client.id));
            });

            const unsubProgress = window.electronAPI.onTransferProgress((progress) => {
                setCurrentTransfer(progress);
            });

            return () => {
                unsubFile();
                unsubConnect();
                unsubDisconnect();
                unsubProgress();
            };
        }
    }, []);

    const copyUrl = useCallback(() => {
        if (serverInfo?.url) {
            navigator.clipboard.writeText(serverInfo.url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [serverInfo]);

    const openDownloadsFolder = useCallback(async () => {
        if (window.electronAPI) {
            await window.electronAPI.openFolder(downloadsPath + '/WiFiShare');
        }
    }, [downloadsPath]);

    const selectFilesToShare = useCallback(async () => {
        if (window.electronAPI) {
            const files = await window.electronAPI.selectFiles();
            if (files.length > 0) {
                console.log('Sharing files:', files);
                const sharedIds = await window.electronAPI.shareFiles(files);
                console.log('Files shared with IDs:', sharedIds);
            }
        }
    }, []);

    if (!serverInfo) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-white/70">Démarrage du serveur...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-6">
            {/* Header */}
            <header className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                        <Wifi className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">WiFiShare</h1>
                        <p className="text-white/50 text-sm">Transfert de fichiers local</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-500/20 rounded-full">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-green-400 text-sm">Serveur actif</span>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* QR Code Section */}
                <div className="lg:col-span-1">
                    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Smartphone className="w-5 h-5 text-purple-400" />
                            Scanner pour connecter
                        </h2>

                        <div className="bg-white rounded-2xl p-4 mx-auto w-fit">
                            <QRCodeSVG
                                value={serverInfo.url}
                                size={180}
                                level="M"
                                includeMargin={false}
                            />
                        </div>

                        <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                                <div>
                                    <p className="text-xs text-white/50">Code de session</p>
                                    <p className="font-mono font-bold text-xl tracking-wider">{serverInfo.sessionCode}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-white/50">URL</p>
                                    <p className="font-mono text-sm truncate">{serverInfo.url}</p>
                                </div>
                                <button
                                    onClick={copyUrl}
                                    className="ml-2 p-2 hover:bg-white/10 rounded-lg transition-colors"
                                    title="Copier l'URL"
                                >
                                    {copied ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Connected Clients & Transfers */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Connected Clients */}
                    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-purple-400" />
                            Appareils connectés
                            <span className="ml-auto text-sm bg-purple-500/30 px-2 py-0.5 rounded-full">
                                {connectedClients.length}
                            </span>
                        </h2>

                        {connectedClients.length === 0 ? (
                            <div className="text-center py-8 text-white/50">
                                <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>Aucun appareil connecté</p>
                                <p className="text-sm">Scannez le QR code avec votre téléphone</p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {connectedClients.map(client => (
                                    <div key={client.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                                            <Smartphone className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Appareil {client.id.slice(0, 4)}</p>
                                            <p className="text-sm text-green-400">Connecté</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Current Transfer */}
                    {currentTransfer && (
                        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/50">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
                                Transfert en cours
                            </h2>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="truncate">{currentTransfer.fileName}</span>
                                    <span>{currentTransfer.percent}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                                        style={{ width: `${currentTransfer.percent}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Received Files */}
                    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Download className="w-5 h-5 text-purple-400" />
                                Fichiers reçus
                            </h2>
                            <button
                                onClick={openDownloadsFolder}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm"
                            >
                                <FolderOpen className="w-4 h-4" />
                                Ouvrir le dossier
                            </button>
                        </div>

                        {receivedFiles.length === 0 ? (
                            <div className="text-center py-8 text-white/50">
                                <FileUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>Aucun fichier reçu</p>
                                <p className="text-sm">Les fichiers envoyés depuis les appareils connectés apparaîtront ici</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {receivedFiles.map((file, index) => (
                                    <div key={index} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                                            <CheckCircle className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{file.name}</p>
                                            <p className="text-sm text-white/50">
                                                {file.timestamp.toLocaleTimeString()}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Share Button */}
                    <button
                        onClick={selectFilesToShare}
                        disabled={connectedClients.length === 0}
                        className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                    >
                        <FileUp className="w-5 h-5" />
                        Partager des fichiers
                    </button>
                </div>
            </div>
        </div>
    );
}
