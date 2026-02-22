// ============================================================================
// DesktopHome - Aether Design
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, FileUp, FolderOpen, Check } from 'lucide-react';
import '../styles/aether-design-system.css';

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

export function DesktopHomeAether() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>([]);
  const [currentTransfer, setCurrentTransfer] = useState<TransferProgress | null>(null);
  const [copied, setCopied] = useState(false);

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

  const copyCode = useCallback(() => {
    if (serverInfo?.sessionCode) {
      navigator.clipboard.writeText(serverInfo.sessionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [serverInfo]);

  const openDownloads = useCallback(async () => {
    if (window.electronAPI) {
      const path = await window.electronAPI.getDownloadsPath();
      await window.electronAPI.openFolder(path + '/WiFiShare');
    }
  }, []);

  const selectFiles = useCallback(async () => {
    if (window.electronAPI) {
      const files = await window.electronAPI.selectFiles();
      if (files.length > 0) {
        await window.electronAPI.shareFiles(files);
      }
    }
  }, []);

  if (!serverInfo) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="aether-bg">
          <div className="aether-orb aether-orb--primary" style={{ opacity: 0.1 }} />
        </div>
        <div className="flex flex-col items-center animate-fade-in">
          <div className="relative w-12 h-12 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#7C3AED] animate-spin" />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)' }} className="text-sm tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background */}
      <div className="aether-bg">
        <div className="aether-orb aether-orb--primary" />
        <div className="aether-orb aether-orb--secondary" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md animate-scale-in">
          
          {/* Header */}
          <header className="text-center mb-8">
            <div className="aether-icon-box aether-icon-box--large mx-auto mb-5" style={{ animation: 'float 6s ease-in-out infinite' }}>
              <Wifi className="w-7 h-7" />
            </div>
            <h1 className="aether-title aether-title--small mb-3">WiFi Share</h1>
            <div className="aether-status">
              <span className={`aether-status__dot ${connectedClients.length > 0 ? 'aether-status__dot--online' : 'aether-status__dot--offline'}`} />
              <span style={{ color: 'rgba(255,255,255,0.48)' }} className="text-xs font-medium tracking-wide uppercase">
                {connectedClients.length > 0 ? `${connectedClients.length} device${connectedClients.length > 1 ? 's' : ''} connected` : 'Waiting for connection'}
              </span>
            </div>
          </header>

          {/* QR Card */}
          <div className="aether-card mb-6 text-center">
            <div className="flex justify-center mb-6">
              <div className="aether-qr">
                <QRCodeSVG
                  value={serverInfo.url}
                  size={180}
                  level="M"
                  fgColor="#000000"
                  bgColor="#FFFFFF"
                />
              </div>
            </div>

            <p className="aether-body mb-6">Scan with your mobile camera to connect</p>

            {/* Session Code */}
            <div className="flex flex-col items-center">
              <span className="aether-label mb-3">Session Code</span>
              <button onClick={copyCode} className="aether-code relative">
                {serverInfo.sessionCode}
                {copied && (
                  <span className="absolute -right-16 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-medium" style={{ color: '#22C55E' }}>
                    <Check className="w-3 h-3" /> Copied
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={selectFiles}
              disabled={connectedClients.length === 0}
              className="aether-btn aether-btn--primary aether-btn--large"
              style={{ opacity: connectedClients.length === 0 ? 0.4 : 1, cursor: connectedClients.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              <FileUp className="w-5 h-5" />
              Send Files
            </button>

            <button
              onClick={openDownloads}
              className="aether-btn aether-btn--secondary aether-btn--large"
            >
              <FolderOpen className="w-5 h-5" />
              Downloads
            </button>
          </div>

          {/* Transfer Progress */}
          {currentTransfer && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm animate-slide-up">
              <div className="aether-card" style={{ padding: '20px' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="aether-label">Transferring</span>
                  <span className="text-sm font-mono" style={{ color: '#7C3AED' }}>{currentTransfer.percent}%</span>
                </div>
                <p className="text-sm font-medium text-white mb-3 truncate">{currentTransfer.fileName}</p>
                <div className="aether-progress">
                  <div className="aether-progress__bar" style={{ width: `${currentTransfer.percent}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DesktopHomeAether;
