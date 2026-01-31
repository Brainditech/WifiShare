// ============================================================================
// DesktopHome - Soft UI Bento Layout
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
    Wifi,
    FolderOpen,
    Users,
    FileUp,
    Smartphone,
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

    // Pour l'animation
    const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);

    useEffect(() => {
        const loadServerInfo = async () => {
            if (window.electronAPI) {
                const info = await window.electronAPI.getServerInfo();
                setServerInfo(info);
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
            setShowCopiedTooltip(true);
            setTimeout(() => {
                setShowCopiedTooltip(false);
            }, 2000);
        }
    }, [serverInfo]);

    const openDownloadsFolder = useCallback(async () => {
        if (window.electronAPI) {
            const path = await window.electronAPI.getDownloadsPath();
            await window.electronAPI.openFolder(path + '/WiFiShare');
        }
    }, []);

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
            <div className="min-h-screen flex items-center justify-center bg-[#F5F6FA]">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center mb-4">
                        <Wifi className="text-white" />
                    </div>
                    <p className="text-gray-400 font-medium">Starting server...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen relative p-8 md:p-12 overflow-hidden">
            {/* Background Blobs */}
            <div className="animate-blobs">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="max-w-6xl mx-auto relative z-10">
                {/* Header */}
                <header className="flex items-center justify-between mb-12">
                    <div>
                        <h1 className="heading-xl mb-2">Hello, User 👋</h1>
                        <p className="text-body font-medium">Ready to share files?</p>
                    </div>

                    <div className="status-pill">
                        <div className="dot dot-success animate-pulse"></div>
                        <span>Server Active</span>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">

                    {/* LEFT COLUMN (QR & INFO) - SPAN 5 */}
                    <div className="md:col-span-5 flex flex-col gap-6">

                        {/* Main QR Card */}
                        <div className="bento-card bg-white flex flex-col items-center text-center py-10">
                            <h2 className="heading-lg mb-2">Scan to Connect</h2>
                            <p className="text-gray-400 text-sm mb-8">Use your phone's camera</p>

                            <div className="qr-frame mb-8 pointer-events-none select-none">
                                <QRCodeSVG
                                    value={serverInfo.url}
                                    size={180}
                                    level="M"
                                    fgColor="#1C1C1E"
                                />
                            </div>

                            <div
                                onClick={copyUrl}
                                className="cursor-pointer group relative bg-gray-50 hover:bg-gray-100 rounded-xl p-4 w-full max-w-xs transition-colors"
                            >
                                <p className="text-label text-xs mb-1">SESSION CODE</p>
                                <p className="text-3xl font-bold tracking-widest text-[#1C1C1E] font-mono group-hover:scale-105 transition-transform">
                                    {serverInfo.sessionCode}
                                </p>

                                {showCopiedTooltip && (
                                    <div className="absolute top-0 right-0 -mt-8 bg-black text-white text-xs px-3 py-1 rounded-full animate-bounce">
                                        Copied!
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* RIGHT COLUMN (DEVICES & ACTIONS) - SPAN 7 */}
                    <div className="md:col-span-7 flex flex-col gap-6">

                        {/* Connected Devices Card (Blue Accent) */}
                        <div className="bento-card bento-card-blue min-h-[180px]">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="heading-lg">Devices</h2>
                                    <p className="text-blue-800/60 font-medium">Connected peers</p>
                                </div>
                                <div className="w-12 h-12 bg-white/50 rounded-full flex items-center justify-center">
                                    <Users className="text-blue-600 w-6 h-6" />
                                </div>
                            </div>

                            {connectedClients.length === 0 ? (
                                <div className="flex items-center gap-3 opacity-50">
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></div>
                                    <p className="font-medium text-blue-900">Waiting for connection...</p>
                                </div>
                            ) : (
                                <div className="flex gap-4 overflow-x-auto pb-2">
                                    {connectedClients.map((client) => (
                                        <div key={client.id} className="bg-white/60 backdrop-blur-sm p-4 rounded-xl flex items-center gap-3 min-w-[160px]">
                                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                                <Smartphone className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-gray-800">Mobile</p>
                                                <p className="text-xs text-gray-500 uppercase">{client.id.slice(0, 4)}</p>
                                            </div>
                                            <div className="w-2 h-2 bg-green-500 rounded-full ml-auto"></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Actions Grid */}
                        <div className="grid grid-cols-2 gap-6">

                            {/* Send Files Button (Big) */}
                            <button
                                onClick={selectFilesToShare}
                                disabled={connectedClients.length === 0}
                                className="bento-card bg-[#1C1C1E] text-white hover:bg-black group flex flex-col justify-between items-start text-left min-h-[180px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none"
                            >
                                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-white/20 transition-colors">
                                    <FileUp className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">Send Files</h3>
                                    <p className="text-gray-400 text-sm mt-1">To connected device</p>
                                </div>
                            </button>

                            {/* Downloads Folder Button */}
                            <button
                                onClick={openDownloadsFolder}
                                className="bento-card bento-card-green hover:bg-[#d1fae5] group flex flex-col justify-between items-start text-left min-h-[180px] cursor-pointer border-none"
                            >
                                <div className="w-12 h-12 bg-green-200/50 rounded-full flex items-center justify-center">
                                    <FolderOpen className="w-6 h-6 text-green-800" />
                                </div>
                                <div className="w-full">
                                    <div className="flex justify-between items-end">
                                        <h3 className="text-xl font-bold text-green-900">Downloads</h3>
                                        <ArrowUpRight className="text-green-700 w-5 h-5 mb-1" />
                                    </div>
                                    <p className="text-green-800/60 text-sm mt-1">{receivedFiles.length} files received</p>
                                </div>
                            </button>
                        </div>

                        {/* Transfer Progress (Conditional) */}
                        {currentTransfer && (
                            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-md bg-white rounded-full shadow-xl p-2 pr-6 flex items-center gap-4 z-50 animate-float">
                                <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center shrink-0">
                                    <Zap className="text-white w-5 h-5 fill-current" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate">{currentTransfer.fileName}</p>
                                    <div className="h-1.5 w-full bg-gray-100 rounded-full mt-1 overflow-hidden">
                                        <div
                                            className="h-full bg-black rounded-full transition-all duration-300"
                                            style={{ width: `${currentTransfer.percent}%` }}
                                        />
                                    </div>
                                </div>
                                <span className="font-bold text-sm">{currentTransfer.percent}%</span>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}
