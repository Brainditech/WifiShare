// ============================================================================
// WiFiShare Desktop - Application principale (Design Aether)
// Supporte mode Desktop (Electron) et mode Web Client (navigateur)
// ============================================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { DesktopHomeAether } from './pages/DesktopHomeAether';
import { WebClientAether } from './pages/WebClientAether';
import './styles/aether-design-system.css';

// Detect if running in Electron
const isElectron = (): boolean => {
  return typeof window !== 'undefined' &&
    typeof window.electronAPI !== 'undefined';
};

function AppRoutes() {
  const mode = isElectron() ? 'desktop' : 'web';

  return (
    <Routes>
      {/* Desktop mode - shows QR code, Web mode - shows client interface */}
      <Route path="/" element={mode === 'desktop' ? <DesktopHomeAether /> : <WebClientAether />} />

      {/* Fallback - all routes go to same component */}
      <Route path="*" element={mode === 'desktop' ? <DesktopHomeAether /> : <WebClientAether />} />
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
