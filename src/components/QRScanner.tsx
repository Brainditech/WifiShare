// ============================================================================
// WiFiShare - Composant QR Scanner (Version simplifiée)
// Scanner de code QR par caméra
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, AlertTriangle } from 'lucide-react';

interface QRScannerProps {
    onScan: (code: string) => void;
    onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
    const [error, setError] = useState<string>('');
    const [isStarting, setIsStarting] = useState(true);
    const [isReady, setIsReady] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const hasScannedRef = useRef(false);
    const isMountedRef = useRef(true);

    const stopScanner = useCallback(async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
            } catch {
                // Ignore stop errors
            }
            scannerRef.current = null;
        }
    }, []);

    const handleClose = useCallback(async () => {
        await stopScanner();
        onClose();
    }, [stopScanner, onClose]);

    const handleScanSuccess = useCallback(async (code: string) => {
        if (hasScannedRef.current || !isMountedRef.current) return;
        hasScannedRef.current = true;

        console.log('✅ QR Code detected:', code);

        // Stop scanner first
        await stopScanner();

        // Then call onScan
        onScan(code);
    }, [stopScanner, onScan]);

    useEffect(() => {
        isMountedRef.current = true;
        hasScannedRef.current = false;

        const startScanner = async () => {
            try {
                // Get available cameras
                const devices = await Html5Qrcode.getCameras();

                if (!isMountedRef.current) return;

                if (!devices || devices.length === 0) {
                    setError('Aucune caméra disponible');
                    setIsStarting(false);
                    return;
                }

                // Create scanner
                const scanner = new Html5Qrcode('qr-scanner-element', { verbose: false });
                scannerRef.current = scanner;

                // Prefer back camera
                const backCamera = devices.find((d: { id: string; label: string }) =>
                    d.label.toLowerCase().includes('back') ||
                    d.label.toLowerCase().includes('arrière') ||
                    d.label.toLowerCase().includes('rear')
                );
                const cameraId = backCamera?.id || devices[0].id;

                await scanner.start(
                    cameraId,
                    {
                        fps: 10,
                        qrbox: { width: 200, height: 200 },
                    },
                    (decodedText: string) => {
                        // Extract 6-character code
                        const code = decodedText.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                        if (code.length >= 6) {
                            handleScanSuccess(code);
                        }
                    },
                    () => {
                        // Ignore decode errors
                    }
                );

                if (isMountedRef.current) {
                    setIsStarting(false);
                    setIsReady(true);
                }
            } catch (err) {
                console.error('Scanner error:', err);
                if (isMountedRef.current) {
                    const message = err instanceof Error ? err.message : 'Erreur inconnue';
                    if (message.includes('Permission') || message.includes('denied')) {
                        setError('Permission caméra refusée');
                    } else {
                        setError('Impossible d\'accéder à la caméra');
                    }
                    setIsStarting(false);
                }
            }
        };

        // Small delay to ensure DOM is ready
        const timer = setTimeout(startScanner, 200);

        return () => {
            isMountedRef.current = false;
            clearTimeout(timer);
            stopScanner();
        };
    }, [handleScanSuccess, stopScanner]);

    return (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-slate-900">
                <div className="flex items-center gap-2 text-white">
                    <Camera className="w-5 h-5" />
                    <span className="font-medium">Scanner le QR code</span>
                </div>
                <button
                    onClick={handleClose}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-600"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Scanner area */}
            <div className="flex-1 flex items-center justify-center p-4">
                <div className="relative w-80 h-80">
                    {/* Loading */}
                    {isStarting && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 rounded-xl z-20">
                            <div className="text-center">
                                <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                                <p className="text-slate-400">Démarrage caméra...</p>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 rounded-xl z-20 p-6">
                            <div className="text-center">
                                <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                                <p className="text-red-400 mb-4 text-sm">{error}</p>
                                <button onClick={handleClose} className="px-4 py-2 bg-slate-700 text-white rounded-lg">
                                    Fermer
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Camera view */}
                    <div
                        id="qr-scanner-element"
                        className="w-full h-full rounded-xl overflow-hidden bg-black"
                    ></div>

                    {/* Scan frame overlay */}
                    {isReady && !error && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                            <div className="w-52 h-52 border-2 border-sky-400 rounded-lg relative">
                                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-sky-400 rounded-tl"></div>
                                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-sky-400 rounded-tr"></div>
                                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-sky-400 rounded-bl"></div>
                                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-sky-400 rounded-br"></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Instructions */}
            <div className="p-4 text-center text-slate-400 text-sm bg-slate-900">
                {isStarting ? 'Chargement...' : isReady ? 'Pointez vers le QR code' : 'En attente...'}
            </div>
        </div>
    );
}
