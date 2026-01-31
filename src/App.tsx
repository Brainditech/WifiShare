// ============================================================================
// WiFiShare Desktop - Application principale
// Supporte mode Desktop (Electron) et mode Web Client (navigateur)
// ============================================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { DesktopHome } from './pages/DesktopHome';
import { WebClient } from './pages/WebClient';
import './index.css';

// Detect if running in Electron
const isElectron = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.indexOf(' electron/') > -1 ||
    (typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined');
};

function AppRoutes() {
  const [mode, setMode] = useState<'desktop' | 'web' | 'loading'>('loading');

  useEffect(() => {
    // Check for query param override
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');

    if (modeParam === 'desktop' || isElectron()) {
      setMode('desktop');
    } else {
      setMode('web');
    }
  }, []);

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Desktop mode - shows QR code, Web mode - shows client interface */}
      <Route path="/" element={mode === 'desktop' ? <DesktopHome /> : <WebClient />} />

      {/* Fallback - all routes go to same component */}
      <Route path="*" element={mode === 'desktop' ? <DesktopHome /> : <WebClient />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
