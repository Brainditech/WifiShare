// ============================================================================
// DesktopHome - Vue principale Desktop avec design Apple Premium
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
    Download,
    Smartphone,
    Sparkles,
    ArrowUpRight,
    Zap
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
        const loadServerInfo = async () => {
            if (window.electronAPI) {
                const info = await window.electronAPI.getServerInfo();
                setServerInfo(info);
                const path = await window.electronAPI.getDownloadsPath();
                setDownloadsPath(path);
            }
        };

        loadServerInfo();

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
                await window.electronAPI.shareFiles(files);
            }
        }
    }, []);

    if (!serverInfo) {
        return (
            <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
                {/* Background */}
                <div className="bg-gradient-mesh" />
                <div className="bg-noise" />

                <div className="text-center animate-scale-in">
                    <div className="relative">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-[#007AFF] to-[#AF52DE] flex items-center justify-center animate-pulse-soft">
                            <Wifi className="w-10 h-10 text-white" />
                        </div>
                        <div className="absolute inset-0 w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#007AFF] to-[#AF52DE] blur-2xl opacity-40 animate-pulse-soft" />
                    </div>
                    <p className="text-white/60 text-lg font-medium">Démarrage du serveur...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Background Effects */}
            <div className="bg-gradient-mesh" />
            <div className="bg-noise" />

            <div className="relative z-10 p-8">
                {/* Header */}
                <header className="flex items-center justify-between mb-10 animate-slide-up">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#007AFF] via-[#AF52DE] to-[#FF2D55] flex items-center justify-center shadow-lg">
                                <Wifi className="w-7 h-7 text-white" />
                            </div>
                            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-[#007AFF] to-[#FF2D55] blur-lg opacity-30 -z-10" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                                WiFiShare
                            </h1>
                            <p className="text-white/40 text-sm font-medium">Transfert de fichiers instantané</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card">
                            <div className="status-dot status-dot-success" />
                            <span className="text-[#34C759] text-sm font-semibold">Serveur actif</span>
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">
                    {/* QR Code Section */}
                    <div className="lg:col-span-5 animate-slide-up stagger-1">
                        <div className="glass-card p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5AC8FA]/20 to-[#007AFF]/20 flex items-center justify-center border border-[#007AFF]/20">
                                    <Smartphone className="w-5 h-5 text-[#5AC8FA]" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Scanner pour connecter</h2>
                                    <p className="text-white/40 text-sm">Avec l'appareil photo de votre téléphone</p>
                                </div>
                            </div>

                            {/* QR Code */}
                            <div className="flex justify-center mb-6">
                                <div className="qr-container">
                                    <QRCodeSVG
                                        value={serverInfo.url}
                                        size={200}
                                        level="M"
                                        includeMargin={false}
                                        bgColor="transparent"
                                        fgColor="#1C1C1E"
                                    />
                                </div>
                            </div>

                            {/* Session Info */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div>
                                        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Code de session</p>
                                        <p className="font-mono font-bold text-2xl tracking-[0.3em] text-white">
                                            {serverInfo.sessionCode}
                                        </p>
                                    </div>
                                    <Sparkles className="w-6 h-6 text-[#FF9500]" />
                                </div>

                                <button
                                    onClick={copyUrl}
                                    className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/15 transition-all duration-300 group"
                                >
                                    <div className="flex-1 min-w-0 text-left">
                                        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">URL de connexion</p>
                                        <p className="font-mono text-sm text-white/70 truncate">{serverInfo.url}</p>
                                    </div>
                                    <div className="ml-4 w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-[#007AFF]/20 transition-colors">
                                        {copied ? (
                                            <CheckCircle className="w-5 h-5 text-[#34C759]" />
                                        ) : (
                                            <Copy className="w-5 h-5 text-white/50 group-hover:text-[#007AFF]" />
                                        )}
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="lg:col-span-7 space-y-6">
                        {/* Connected Clients */}
                        <div className="glass-card p-6 animate-slide-up stagger-2">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#34C759]/20 to-[#30D158]/20 flex items-center justify-center border border-[#34C759]/20">
                                        <Users className="w-5 h-5 text-[#34C759]" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-white">Appareils connectés</h2>
                                </div>
                                <span className="px-3 py-1.5 text-sm font-semibold bg-gradient-to-r from-[#007AFF]/20 to-[#AF52DE]/20 rounded-full text-[#007AFF] border border-[#007AFF]/20">
                                    {connectedClients.length}
                                </span>
                            </div>

                            {connectedClients.length === 0 ? (
                                <div className="text-center py-10">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                                        <Smartphone className="w-8 h-8 text-white/20" />
                                    </div>
                                    <p className="text-white/30 font-medium mb-1">Aucun appareil connecté</p>
                                    <p className="text-white/20 text-sm">Scannez le QR code avec votre téléphone</p>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {connectedClients.map((client, index) => (
                                        <div
                                            key={client.id}
                                            className="file-item"
                                            style={{ animationDelay: `${index * 0.1}s` }}
                                        >
                                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#34C759] to-[#30D158] flex items-center justify-center shadow-lg">
                                                <Smartphone className="w-5 h-5 text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-white">Appareil {client.id.slice(0, 4).toUpperCase()}</p>
                                                <p className="text-sm text-[#34C759]">Connecté</p>
                                            </div>
                                            <div className="status-dot status-dot-success" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Current Transfer */}
                        {currentTransfer && (
                            <div className="glass-card p-6 border-[#007AFF]/30 animate-scale-in">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#007AFF]/20 to-[#5AC8FA]/20 flex items-center justify-center border border-[#007AFF]/20 animate-pulse-soft">
                                        <Zap className="w-5 h-5 text-[#007AFF]" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-white">Transfert en cours</h2>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-white/70 truncate max-w-[70%]">{currentTransfer.fileName}</span>
                                        <span className="text-[#007AFF] font-semibold">{currentTransfer.percent}%</span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-bar-fill"
                                            style={{ width: `${currentTransfer.percent}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Received Files */}
                        <div className="glass-card p-6 animate-slide-up stagger-3">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#AF52DE]/20 to-[#FF2D55]/20 flex items-center justify-center border border-[#AF52DE]/20">
                                        <Download className="w-5 h-5 text-[#AF52DE]" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-white">Fichiers reçus</h2>
                                </div>
                                <button
                                    onClick={openDownloadsFolder}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/70 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 hover:border-white/15 transition-all duration-300"
                                >
                                    <FolderOpen className="w-4 h-4" />
                                    <span>Ouvrir</span>
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {receivedFiles.length === 0 ? (
                                <div className="text-center py-10">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                                        <FileUp className="w-8 h-8 text-white/20" />
                                    </div>
                                    <p className="text-white/30 font-medium mb-1">Aucun fichier reçu</p>
                                    <p className="text-white/20 text-sm">Les fichiers transférés apparaîtront ici</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                                    {receivedFiles.map((file, index) => (
                                        <div key={index} className="file-item">
                                            <div className="file-icon">
                                                <CheckCircle className="w-5 h-5 text-[#34C759]" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-white truncate">{file.name}</p>
                                                <p className="text-sm text-white/40">
                                                    {file.timestamp.toLocaleTimeString('fr-FR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
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
                            className="w-full py-5 rounded-2xl font-semibold text-lg flex items-center justify-center gap-3 transition-all duration-300 animate-slide-up stagger-4 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none bg-gradient-to-r from-[#007AFF] via-[#AF52DE] to-[#FF2D55] hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
                            style={{
                                boxShadow: connectedClients.length > 0
                                    ? '0 8px 32px rgba(0, 122, 255, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset'
                                    : 'none'
                            }}
                        >
                            <FileUp className="w-6 h-6" />
                            <span>Partager des fichiers</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
