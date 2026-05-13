// ============================================================================
// WebClient - Aether Design
//
// Architecture (v2 — robust):
//   - WebSocket: authentication + available-files list + download notifications.
//                Used only as a signaling channel. If it drops, uploads still work.
//   - HTTP POST /api/upload: file uploads. The browser streams the file natively,
//                which survives backgrounding, mobile file pickers (including
//                folder navigation), and slow networks. No chunks, no ACKs, no
//                zombie-WS detection — the browser handles transport reliability.
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
  queueInfo?: string;
}

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
  const reconnectDelayRef = useRef<number>(1000);
  const hasEverConnectedRef = useRef<boolean>(false);
  // Active XHR for the in-flight upload — used to cancel from UI.
  const currentXhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => { connectionStateRef.current = connectionState; }, [connectionState]);

  const handleMessage = useCallback((message: { type: string; [key: string]: unknown }) => {
    switch (message.type) {
      case 'auth-success':
        hasEverConnectedRef.current = true;
        setConnectionState('connected');
        break;
      case 'auth-failed':
        setConnectionState('error');
        setError((message.reason as string) || 'Authentication failed');
        break;
      case 'available-files':
        setAvailableFiles(message.files as AvailableFile[]);
        break;
      case 'file-ready':
        downloadFile(message.downloadUrl as string, message.fileName as string);
        break;
      case 'error':
        setError(message.message as string);
        break;
    }
  }, []);

  // ── WebSocket lifecycle ──────────────────────────────────────────────────
  // The WS is for signaling only (auth + available files + download links).
  // We reconnect with a simple backoff; uploads don't depend on it.
  useEffect(() => {
    if (!sessionCode) { setError('Missing session code'); setConnectionState('error'); return; }

    let isMounted = true;
    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }

      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        try { ws.close(); } catch { /* ignore */ }
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        reconnectDelayRef.current = 1000;
        ws?.send(JSON.stringify({ type: 'auth', sessionCode }));
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 15_000);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try { handleMessage(JSON.parse(event.data)); } catch { /* malformed, ignore */ }
      };

      ws.onclose = () => {
        if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        if (!isMounted) return;

        const prev = connectionStateRef.current;
        if (prev === 'error') return;

        // Never authenticated → bootstrap failure
        if (!hasEverConnectedRef.current && prev === 'connecting') {
          setConnectionState('error');
          setError('Cannot reach server. Check that the desktop app is running on the same Wi-Fi.');
          return;
        }

        setConnectionState('disconnected');

        // Only auto-reconnect while the page is foreground — when backgrounded
        // (file picker open), the browser kills new sockets instantly. The
        // visibility/focus handlers below trigger reconnection on return.
        if (document.visibilityState === 'visible') {
          const delay = reconnectDelayRef.current;
          reconnectDelayRef.current = Math.min(delay * 1.5, 15_000);
          reconnectTimeout = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => { /* onclose will fire next */ };
    };

    const tryReconnectIfNeeded = () => {
      const state = connectionStateRef.current;
      if (state !== 'disconnected' && state !== 'connecting') return;
      const currentWs = wsRef.current;
      if (currentWs?.readyState === WebSocket.OPEN || currentWs?.readyState === WebSocket.CONNECTING) return;
      if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
      reconnectDelayRef.current = 1000;
      connect();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') tryReconnectIfNeeded();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', tryReconnectIfNeeded);
    window.addEventListener('pageshow', tryReconnectIfNeeded);

    connect();
    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', tryReconnectIfNeeded);
      window.removeEventListener('pageshow', tryReconnectIfNeeded);
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; ws.close(); }
      if (currentXhrRef.current) { try { currentXhrRef.current.abort(); } catch { /* ignore */ } }
    };
  }, [sessionCode, handleMessage]);

  const downloadFile = (url: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Upload (HTTP POST) ───────────────────────────────────────────────────
  // We use XMLHttpRequest (not fetch) because it gives us upload.onprogress
  // and a reliable .abort() for cancellation. The browser owns the connection
  // for the upload — it survives page backgrounding, picker overlays, and
  // momentary network blips. No retries are needed here.
  const uploadFile = (file: File, queueInfo?: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      currentXhrRef.current = xhr;

      xhr.open('POST', '/api/upload', true);
      xhr.setRequestHeader('X-Session-Code', sessionCode);
      xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
        setCurrentTransfer({ fileName: file.name, percent, direction: 'upload', queueInfo });
      };

      xhr.onload = () => {
        currentXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          setCurrentTransfer({ fileName: file.name, percent: 100, direction: 'upload', queueInfo });
          resolve();
        } else if (xhr.status === 401) {
          reject(new Error('Session expired. Reload the page to get a new code.'));
        } else if (xhr.status === 413) {
          reject(new Error('File too large.'));
        } else {
          reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        }
      };

      xhr.onerror = () => {
        currentXhrRef.current = null;
        reject(new Error('Network error during upload'));
      };
      xhr.onabort = () => {
        currentXhrRef.current = null;
        reject(new Error('Upload cancelled'));
      };

      setCurrentTransfer({ fileName: file.name, percent: 0, direction: 'upload', queueInfo });
      xhr.send(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // Clone immediately — the input gets reset before async work runs
    const files = Array.from(event.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0) return;

    setError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const queueInfo = files.length > 1 ? `${i + 1}/${files.length}` : undefined;
        await uploadFile(files[i], queueInfo);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      // Don't surface cancellation as an error
      if (msg !== 'Upload cancelled') setError(msg);
    } finally {
      setCurrentTransfer(null);
      currentXhrRef.current = null;
    }
  };

  const cancelTransfer = () => {
    if (currentXhrRef.current) {
      try { currentXhrRef.current.abort(); } catch { /* ignore */ }
      currentXhrRef.current = null;
    }
    setCurrentTransfer(null);
  };

  const requestFile = (fileId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'file-request', payload: { fileId } }));
  };

  // ── Render ───────────────────────────────────────────────────────────────
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

  const isReconnecting = connectionState === 'disconnected';
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <div className="aether-bg">
        <div className="aether-orb aether-orb--primary" style={{ background: isReconnecting ? '#F59E0B' : '#22C55E', opacity: 0.1, top: '-10%', right: '-10%' }} />
        <div className="aether-orb aether-orb--secondary" style={{ opacity: 0.08 }} />
      </div>

      {isReconnecting && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 py-2" style={{ background: 'rgba(245, 158, 11, 0.15)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <div className="w-3 h-3 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
          <span className="text-xs font-medium text-amber-400">Signaling reconnecting…</span>
        </div>
      )}

      <header className="relative z-10 px-6 py-8 flex items-center justify-between" style={{ marginTop: isReconnecting ? '28px' : 0 }}>
        <div className="aether-icon-box" style={{ width: '40px', height: '40px' }}>
          <Wifi className="w-4 h-4" />
        </div>
        <div className="aether-status" role="status" aria-label={`Connection status: ${isReconnecting ? 'Reconnecting' : 'Connected'}`}>
          <span className="aether-status__dot" style={{ background: isReconnecting ? '#F59E0B' : undefined }} />
          <span style={{ color: 'rgba(255,255,255,0.48)' }} className="text-xs font-medium tracking-wide uppercase">
            {isReconnecting ? 'Reconnecting...' : 'Connected'}
          </span>
        </div>
      </header>

      <main className="relative z-10 px-6 pb-8">
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

        <div className="mb-8">
          <label
            htmlFor="wifishare-file-input"
            className="aether-btn aether-btn--primary aether-btn--large w-full py-6 text-lg"
            aria-disabled={!!currentTransfer}
            style={{
              cursor: currentTransfer ? 'not-allowed' : 'pointer',
              opacity: currentTransfer ? 0.6 : 1,
              pointerEvents: currentTransfer ? 'none' : 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <Upload className="w-6 h-6" />
            {currentTransfer ? 'Sending...' : 'Send File'}
          </label>
          <input
            ref={fileInputRef}
            id="wifishare-file-input"
            type="file"
            multiple
            onChange={handleFileSelect}
            disabled={!!currentTransfer}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
            aria-label="Select files to send"
          />
        </div>

        {availableFiles.length > 0 && (
          <div className="animate-slide-up">
            <h3 className="aether-label mb-4 text-center">Available Downloads</h3>
            <div className="space-y-3">
              {availableFiles.map((file) => (
                <div
                  key={file.id}
                  onClick={() => requestFile(file.id)}
                  className="aether-file-item"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && requestFile(file.id)}
                  aria-label={`Download ${file.name}`}
                >
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

      {currentTransfer && (
        <div
          className="fixed inset-x-4 bottom-6 z-50 animate-slide-up"
          role="status"
          aria-live="polite"
          aria-label={`Transfer progress: ${currentTransfer.percent}%`}
        >
          <div className="aether-card" style={{ padding: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="aether-label">
                {currentTransfer.direction === 'upload' ? 'Sending' : 'Receiving'}
                {currentTransfer.queueInfo ? ` (${currentTransfer.queueInfo})` : ''}
              </span>
              <span className="text-sm font-mono" style={{ color: '#7C3AED' }}>{currentTransfer.percent}%</span>
            </div>
            <p className="text-sm font-medium text-white mb-3 truncate">{currentTransfer.fileName}</p>
            <div className="aether-progress" role="progressbar" aria-valuenow={currentTransfer.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="aether-progress__bar" style={{ width: `${currentTransfer.percent}%` }} />
            </div>
            <button
              type="button"
              onClick={cancelTransfer}
              className="mt-3 w-full aether-btn aether-btn--secondary text-sm"
              style={{ color: 'rgba(239,68,68,0.8)', borderColor: 'rgba(239,68,68,0.3)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && connectionState === 'connected' && (
        <div className="fixed inset-x-4 top-4 z-50 animate-slide-up">
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

export default WebClientAether;
