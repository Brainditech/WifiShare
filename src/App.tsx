// ============================================================================
// WiFiShare - Application principale
// Version PeerJS - Transfert P2P fiable
// ============================================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import './index.css';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Toutes les routes sont maintenant gérées dans Home */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
