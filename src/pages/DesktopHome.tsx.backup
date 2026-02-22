// ============================================================================
// DesktopHome - Syncra Dark Layout
// Centered, Minimalist, Dark Mode
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
    Wifi,
    FileUp,
    Download,
    Check
} from 'lucide-react';

interface ServerInfo {
    ip: string;
    port: number;
    sessionCode: string;
    url: string;
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
    const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>([]);
    const [currentTransfer, setCurrentTransfer] = useState<TransferProgress | null>(null);
    const [showCopied, setShowCopied] = useState(false);

    useEffect(() => {
        const loadServerInfo = async () => {
            if (window.electronAPI) {
                const info = await window.electronAPI.getServerInfo();
                setServerInfo(info);
            }
        };

        loadServerInfo();

        if (window.electronAPI) {
            const unsubFile = window.electronAPI.onFileReceived(() => {
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
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
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
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center mb-4 animate-spin">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                    <p className="text-white/40 text-sm tracking-widest uppercase">Initializing</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen relative overflow-hidden bg-black text-white selection:bg-purple-500/30">
            {/* Background Ambience */}
            <div className="fixed top-[-20%] left-[20%] w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[100px] pointer-events-none" />

            {/* Main Container - Centered Single Scene */}
            <div className="w-full h-screen max-w-sm mx-auto relative z-10 flex flex-col items-center justify-center p-6">

                {/* Header - Condensed */}
                <header className="text-center mb-8 shrink-0">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 mb-4 backdrop-blur-xl">
                        <Wifi className="w-6 h-6 text-white" />
                    </div>
                    <h1 className="heading-syncra mb-1 text-2xl! bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70">WiFi Share</h1>
                    <div className="flex items-center justify-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${connectedClients.length > 0 ? 'bg-[#00FF94] shadow-[0_0_8px_#00FF94]' : 'bg-white/20'}`} />
                        <p className="text-white/40 text-[10px] font-medium tracking-wide">
                            {connectedClients.length > 0 ? `${connectedClients.length} DEVICE CONNECTED` : 'WAITING FOR CONNECTION'}
                        </p>
                    </div>
                </header>

                {/* Main Action Card - Condensed */}
                <div className="syncra-card flex flex-col items-center text-center p-6 mb-6 transform hover:scale-[1.01] transition-transform w-full shrink-0">
                    <div className="qr-container-dark mb-5 p-3 rounded-xl">
                        <QRCodeSVG
                            value={serverInfo.url}
                            size={160}
                            level="M"
                            fgColor="#000000"
                            bgColor="#FFFFFF"
                        />
                    </div>

                    <p className="text-white/50 text-[11px] mb-4 max-w-xs mx-auto">
                        Scan with your mobile camera
                    </p>

                    <div
                        onClick={copyUrl}
                        className="group flex flex-col items-center cursor-pointer"
                    >
                        <p className="text-white/30 text-[10px] font-bold tracking-[0.2em] mb-1 uppercase">Session Code</p>
                        <div className="relative">
                            <p className="text-3xl font-mono font-bold text-white tracking-widest group-hover:text-[#E0C3FC] transition-colors">
                                {serverInfo.sessionCode}
                            </p>
                            {showCopied && (
                                <div className="absolute top-1/2 left-full ml-4 -translate-y-1/2 flex items-center gap-1 text-[#00FF94] text-xs font-bold uppercase tracking-wider animate-in fade-in slide-in-from-left-2">
                                    <Check className="w-3 h-3" /> Copied
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Actions Row - Condensed */}
                <div className="grid grid-cols-2 gap-3 w-full shrink-0">
                    <button
                        onClick={selectFilesToShare}
                        disabled={connectedClients.length === 0}
                        className={`btn-syncra py-3 px-4 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2 ${connectedClients.length === 0 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                    >
                        <FileUp className="w-4 h-4" />
                        <span>Send Files</span>
                    </button>

                    <button
                        onClick={openDownloadsFolder}
                        className="btn-ghost py-3 px-4 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        <span>Downloads</span>
                    </button>
                </div>

                {/* Connected Devices & Activity (Absolute bottom or integrated if space) */}
                {/* Transfer Progress Pill - Absolute Centered */}
                {currentTransfer && (
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#0A0A0A] border border-white/10 rounded-full px-4 py-2 flex items-center gap-3 shadow-xl z-50 animate-in slide-in-from-bottom-2">
                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                        <span className="text-xs font-medium text-white max-w-[100px] truncate">{currentTransfer.fileName}</span>
                        <span className="text-xs font-mono font-bold text-purple-400">{currentTransfer.percent}%</span>
                    </div>
                )}
            </div>
        </div>
    );
}
