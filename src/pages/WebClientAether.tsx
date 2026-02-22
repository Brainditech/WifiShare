// ============================================================================
// WebClient - Aether Design
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wifi, Upload, XCircle, Monitor, ArrowRight, FileText, Image, Music, Video, File } from 'lucide-react';
import '../styles/aether-design-system.css';

type ConnectionState = 'connecting' | 'connected' | 'error' | 'disconnected';

interface AvailableFile {
  id: string;
  name: string;
  size?: string;
}

interface TransferProgress {
  fileName: string;
  percent: number;
  direction: 'upload' | 'download';
}

const CHUNK_SIZE = 64 * 1024;

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return <Image className="w-5 h-5" />;
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext || '')) return <Video className="w-5 h-5" />;
  if (['mp3', 'wav', 'flac'].includes(ext || '')) return <Music className="w-5 h-5" />;
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext || '')) return <FileText className="w-5 h-5" />;
  return <File className="w-5 h-5" />;
};

export function WebClientAether() {
  const [searchParams] = useSearchParams();
  const sessionCode = searchParams.get('code') || '';

  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
  const [currentTransfer, setCurrentTransfer] = useState<TransferProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const connectionStateRef = useRef<ConnectionState>('connecting');

  useEffect(() => { connectionStateRef.current = connectionState; }, [connectionState]);

  const handleMessage = useCallback((message: { type: string;[key: string]: unknown }) => {
    switch (message.type) {
      case 'auth-success': setConnectionState('connected'); break;
      case 'auth-failed': setConnectionState('error'); setError(message.reason as string || 'Authentication failed'); break;
      case 'available-files': setAvailableFiles(message.files as AvailableFile[]); break;
      case 'file-complete': setCurrentTransfer(null); break;
      case 'file-ready': downloadFile(message.downloadUrl as string, message.fileName as string); break;
      case 'error': setError(message.message as string); setCurrentTransfer(null); break;
    }
  }, []);

  useEffect(() => {
    if (!sessionCode) { setError('Missing session code'); setConnectionState('error'); return; }

    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let reconnectTimeout: any = null;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'auth', sessionCode }));
        pingInterval = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 30000);
      };

      ws.onmessage = (event) => {
        try { handleMessage(JSON.parse(event.data)); } catch (e) { console.error('Parse error:', e); }
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        if (connectionStateRef.current === 'connected') { setConnectionState('disconnected'); reconnectTimeout = setTimeout(connect, 2000); }
      };
    };

    connect();
    return () => {
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [sessionCode, handleMessage]);

  const downloadFile = (url: string, fileName: string) => {
    const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await sendFile(files[0]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendFile = async (file: File) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { setError('Not connected'); return; }
    const ws = wsRef.current;
    const fileId = Math.random().toString(36).substring(2, 10);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    ws.send(JSON.stringify({ type: 'file-start', payload: { fileId, fileName: file.name, fileSize: file.size, totalChunks } }));
    setCurrentTransfer({ fileName: file.name, percent: 0, direction: 'upload' });

    const reader = new FileReader();
    let chunkIndex = 0;

    const sendNextChunk = () => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      reader.onload = () => {
        ws.send(JSON.stringify({ type: 'file-chunk', payload: { fileId, chunkIndex, data: (reader.result as string).split(',')[1] } }));
        setCurrentTransfer({ fileName: file.name, percent: Math.round(((chunkIndex + 1) / totalChunks) * 100), direction: 'upload' });
        chunkIndex++;
        if (chunkIndex < totalChunks) setTimeout(sendNextChunk, 10);
        else ws.send(JSON.stringify({ type: 'file-end', payload: { fileId } }));
      };
      reader.readAsDataURL(file.slice(start, end));
    };
    sendNextChunk();
  };

  const requestFile = (fileId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'file-request', payload: { fileId } }));
  };

  // Error State
  if (connectionState === 'error') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="aether-bg">
          <div className="aether-orb aether-orb--primary" style={{ opacity: 0.1 }} />
        </div>
        <div className="w-full max-w-sm text-center animate-scale-in">
          <div className="aether-error__icon mx-auto mb-6">
            <XCircle className="w-8 h-8" />
          </div>
          <h1 className="aether-title aether-title--small mb-2">Connection Issue</h1>
          <p className="aether-body mb-8">{error}</p>
          <button onClick={() => window.location.reload()} className="aether-btn aether-btn--primary aether-btn--large w-full">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Connecting State
  if (connectionState === 'connecting') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="aether-bg">
          <div className="aether-orb aether-orb--primary" style={{ opacity: 0.1 }} />
        </div>
        <div className="flex flex-col items-center animate-fade-in">
          <div className="relative w-20 h-20 mb-8">
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#7C3AED] animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[#A78BFA] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Wifi className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.6)' }} />
            </div>
          </div>
          <h1 className="aether-title text-xl mb-2">WiFi Share</h1>
          <span className="aether-label">Connecting to Desktop...</span>
        </div>
      </div>
    );
  }

  // Connected State
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="aether-bg">
        <div className="aether-orb aether-orb--primary" style={{ background: '#22C55E', opacity: 0.1, top: '-10%', right: '-10%' }} />
        <div className="aether-orb aether-orb--secondary" style={{ opacity: 0.08 }} />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-8 flex items-center justify-between">
        <div className="aether-icon-box" style={{ width: '40px', height: '40px' }}>
          <Wifi className="w-4 h-4" />
        </div>
        <div className="aether-status">
          <span className="aether-status__dot aether-status__dot--online" />
          <span style={{ color: 'rgba(255,255,255,0.48)' }} className="text-xs font-medium tracking-wide uppercase">Connected</span>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 px-6 pb-8">
        {/* Hero */}
        <div className="text-center py-8 mb-8">
          <div className="relative w-32 h-32 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border border-[#7C3AED]/20 animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-2 rounded-full border border-[#7C3AED]/30 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
            <div className="absolute inset-4 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7C3AED, #A78BFA)', boxShadow: '0 0 40px rgba(124,58,237,0.4)' }}>
              <Monitor className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="aether-title text-2xl mb-2">Ready to Transfer</h2>
          <p className="aether-body">Tap below to send files to your desktop</p>
        </div>

        {/* Upload */}
        <div className="mb-8">
          <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" id="mobile-upload" />
          <label htmlFor="mobile-upload" className="block">
            <button className="aether-btn aether-btn--primary aether-btn--large w-full py-6 text-lg" style={{ cursor: 'pointer' }}>
              <Upload className="w-6 h-6" />
              Send File
            </button>
          </label>
        </div>

        {/* Available Files */}
        {availableFiles.length > 0 && (
          <div className="animate-slide-up">
            <h3 className="aether-label mb-4 text-center">Available Downloads</h3>
            <div className="space-y-3">
              {availableFiles.map((file) => (
                <div key={file.id} onClick={() => requestFile(file.id)} className="aether-file-item">
                  <div className="aether-icon-box" style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, rgba(124,58,237,0.2), transparent)', color: '#A78BFA' }}>
                    {getFileIcon(file.name)}
                  </div>
                  <span className="flex-1 text-sm font-medium truncate" style={{ color: 'white' }}>{file.name}</span>
                  {file.size && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.28)' }}>{file.size}</span>}
                  <ArrowRight className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Transfer Progress */}
      {currentTransfer && (
        <div className="fixed inset-x-4 bottom-6 z-50 animate-slide-up">
          <div className="aether-card" style={{ padding: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="aether-label">{currentTransfer.direction === 'upload' ? 'Sending' : 'Receiving'}</span>
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
  );
}

export default WebClientAether;
