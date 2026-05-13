// ============================================================================
// DesktopHome - Aether Design
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, FileUp, FolderOpen, Check, XCircle, Clock } from 'lucide-react';
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

interface ReceivedFile {
  name: string;
  path: string;
  time: number;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 10) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function DesktopHomeAether() {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>([]);
  const [currentTransfer, setCurrentTransfer] = useState<TransferProgress | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  // Trigger re-render for relative time updates
  const [, setTimeTick] = useState(0);

  useEffect(() => {
    const loadServerInfo = async () => {
      try {
        if (window.electronAPI) {
          const info = await window.electronAPI.getServerInfo();
          setServerInfo(info);
        }
      } catch {
        setError('Failed to load server info. Please restart the app.');
      }
    };

    loadServerInfo();

    // Tick every 30s to refresh relative times
    const tickInterval = setInterval(() => setTimeTick(t => t + 1), 30_000);

    if (window.electronAPI) {
      const unsubFile = window.electronAPI.onFileReceived((file) => {
        setCurrentTransfer(null);
        setReceivedFiles(prev => [{ ...file, time: Date.now() }, ...prev].slice(0, 5));
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
        clearInterval(tickInterval);
        unsubFile();
        unsubConnect();
        unsubDisconnect();
        unsubProgress();
      };
    }

    return () => clearInterval(tickInterval);
  }, []);

  const copyCode = useCallback(() => {
    if (serverInfo?.sessionCode) {
      navigator.clipboard.writeText(serverInfo.sessionCode).catch(() => {
        // Fallback for environments without clipboard API
        const el = document.createElement('textarea');
        el.value = serverInfo.sessionCode;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [serverInfo]);

  const openDownloads = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const path = await window.electronAPI.getDownloadsPath();
        await window.electronAPI.openFolder(path + '/WiFiShare');
      }
    } catch {
      setError('Could not open downloads folder.');
    }
  }, []);

  const openFileFolder = useCallback(async (filePath: string) => {
    try {
      if (window.electronAPI) {
        const dir = filePath.substring(0, filePath.lastIndexOf('\\') || filePath.lastIndexOf('/'));
        await window.electronAPI.openFolder(dir || filePath);
      }
    } catch {
      setError('Could not open folder.');
    }
  }, []);

  const selectFiles = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const files = await window.electronAPI.selectFiles();
        if (files.length > 0) {
          await window.electronAPI.shareFiles(files);
        }
      }
    } catch {
      setError('Could not share files. Please try again.');
    }
  }, []);

  if (!serverInfo) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="aether-bg">
          <div className="aether-orb aether-orb--primary" style={{ opacity: 0.1 }} />
        </div>
        {error ? (
          <div className="text-center p-6 animate-scale-in">
            <div className="aether-error__icon mx-auto mb-4"><XCircle className="w-8 h-8" /></div>
            <p className="aether-body text-red-400">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center animate-fade-in">
            <div className="relative w-12 h-12 mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#7C3AED] animate-spin" />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)' }} className="text-sm tracking-widest uppercase">Loading</p>
          </div>
        )}
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
            <div className="aether-status" role="status" aria-label={connectedClients.length > 0 ? `${connectedClients.length} device(s) connected` : 'Waiting for connection'}>
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
              <button
                onClick={copyCode}
                className="aether-code relative"
                aria-label={`Copy session code ${serverInfo.sessionCode}`}
              >
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
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={selectFiles}
              disabled={connectedClients.length === 0}
              aria-disabled={connectedClients.length === 0}
              className="aether-btn aether-btn--primary aether-btn--large"
              style={{ opacity: connectedClients.length === 0 ? 0.4 : 1, cursor: connectedClients.length === 0 ? 'not-allowed' : 'pointer' }}
              aria-label="Select and send files to connected devices"
            >
              <FileUp className="w-5 h-5" />
              Send Files
            </button>

            <button
              onClick={openDownloads}
              className="aether-btn aether-btn--secondary aether-btn--large"
              aria-label="Open WiFiShare downloads folder"
            >
              <FolderOpen className="w-5 h-5" />
              Downloads
            </button>
          </div>

          {/* Recent Transfers — in-progress upload is rendered as the first
              row of this same list. Avoids the visual overlap that happened
              when a separate fixed-position progress overlay collided with
              this card at the bottom of the viewport. */}
          {(currentTransfer || receivedFiles.length > 0) && (
            <div className="aether-card animate-slide-up">
              <h3 className="aether-label mb-3">Recent Transfers</h3>
              <div className="space-y-2">
                {currentTransfer && (
                  <div
                    className="py-2 px-1"
                    role="status"
                    aria-live="polite"
                    aria-label={`Receiving ${currentTransfer.fileName}: ${currentTransfer.percent}%`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: '#7C3AED' }} />
                      <span className="flex-1 text-sm truncate text-white">{currentTransfer.fileName}</span>
                      <span className="text-xs font-mono flex-shrink-0" style={{ color: '#7C3AED' }}>
                        {currentTransfer.percent}%
                      </span>
                    </div>
                    <div className="aether-progress" role="progressbar" aria-valuenow={currentTransfer.percent} aria-valuemin={0} aria-valuemax={100}>
                      <div className="aether-progress__bar" style={{ width: `${currentTransfer.percent}%` }} />
                    </div>
                  </div>
                )}
                {receivedFiles.map((file) => (
                  <button
                    // Stable key — server uniquifies filename on conflict, so
                    // `path` is unique per received file. Index-based keys
                    // caused every row to re-animate when a new file landed.
                    key={file.path}
                    onClick={() => openFileFolder(file.path)}
                    className="w-full flex items-center gap-3 text-left py-2 px-1 rounded-lg hover:bg-white/5 transition-colors"
                    aria-label={`Open folder for ${file.name}`}
                  >
                    <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(167,139,250,0.6)' }} />
                    <span className="flex-1 text-sm truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{file.name}</span>
                    <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(file.time)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-50 animate-slide-up">
          <div className="aether-card flex items-center gap-3" style={{ padding: '14px 18px', borderColor: 'rgba(239,68,68,0.4)' }}>
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-sm text-white flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }} aria-label="Dismiss error">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DesktopHomeAether;
