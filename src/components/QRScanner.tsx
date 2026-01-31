// ============================================================================
// WiFiShare - Composant QR Scanner
// Scanner de code QR par caméra
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';

interface QRScannerProps {
    onScan: (code: string) => void;
    onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
    const [error, setError] = useState<string>('');
    const [isStarting, setIsStarting] = useState(true);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let mounted = true;

        const startScanner = async () => {
            if (!containerRef.current) return;

            try {
                const scanner = new Html5Qrcode('qr-reader');
                scannerRef.current = scanner;

                await scanner.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                    },
                    (decodedText) => {
                        if (mounted) {
                            // Extract just the code (6 characters)
                            const code = decodedText.trim().toUpperCase().slice(0, 6);
                            if (code.length === 6) {
                                onScan(code);
                                scanner.stop().catch(console.error);
                            }
                        }
                    },
                    () => {
                        // QR code not found, keep scanning
                    }
                );

                if (mounted) {
                    setIsStarting(false);
                }
            } catch (err) {
                console.error('Scanner error:', err);
                if (mounted) {
                    setError('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
                    setIsStarting(false);
                }
            }
        };

        startScanner();

        return () => {
            mounted = false;
            if (scannerRef.current) {
                scannerRef.current.stop().catch(console.error);
            }
        };
    }, [onScan]);

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-slate-900">
                <div className="flex items-center gap-2 text-white">
                    <Camera className="w-5 h-5" />
                    <span className="font-medium">Scanner le QR code</span>
                </div>
                <button
                    onClick={onClose}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 text-white hover:bg-slate-700"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Scanner area */}
            <div className="flex-1 flex items-center justify-center p-4">
                <div className="relative w-full max-w-sm">
                    {isStarting && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 rounded-xl">
                            <div className="text-center">
                                <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                <p className="text-slate-400 text-sm">Démarrage de la caméra...</p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 rounded-xl p-4">
                            <div className="text-center">
                                <p className="text-red-400 mb-4">{error}</p>
                                <button onClick={onClose} className="btn btn-secondary">
                                    Fermer
                                </button>
                            </div>
                        </div>
                    )}

                    <div
                        id="qr-reader"
                        ref={containerRef}
                        className="rounded-xl overflow-hidden"
                    ></div>

                    {/* Scanning overlay */}
                    {!isStarting && !error && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <div className="w-64 h-64 border-2 border-sky-500 rounded-xl animate-pulse"></div>
                        </div>
                    )}
                </div>
            </div>

            {/* Instructions */}
            <div className="p-4 text-center text-slate-400 text-sm bg-slate-900">
                Placez le QR code dans le cadre
            </div>
        </div>
    );
}
