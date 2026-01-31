// ============================================================================
// WiFiShare - Composant QRCodeDisplay
// Affichage du QR Code pour connexion rapide
// ============================================================================

import { memo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface QRCodeDisplayProps {
    value: string;
    title?: string;
    subtitle?: string;
    size?: number;
}

export const QRCodeDisplay = memo(function QRCodeDisplay({
    value,
    title = 'Scanner pour se connecter',
    subtitle,
    size = 200
}: QRCodeDisplayProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Header */}
            <div className="flex items-center gap-2 text-slate-400">
                <QrCode className="w-5 h-5" />
                <span className="text-sm font-medium">{title}</span>
            </div>

            {/* QR Code Container */}
            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary-500 to-accent-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-300"></div>
                <div className="relative bg-white p-4 rounded-xl">
                    <QRCodeSVG
                        value={value}
                        size={size}
                        level="M"
                        includeMargin={false}
                        fgColor="#0f172a"
                        bgColor="#ffffff"
                    />
                </div>
            </div>

            {/* Subtitle / Session info */}
            {subtitle && (
                <div className="flex items-center gap-2">
                    <code className="px-3 py-1 bg-slate-800 rounded-lg text-xs text-slate-300 font-mono">
                        {subtitle}
                    </code>
                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
                        title="Copier"
                    >
                        {copied ? (
                            <Check className="w-4 h-4 text-green-400" />
                        ) : (
                            <Copy className="w-4 h-4 text-slate-400" />
                        )}
                    </button>
                </div>
            )}

            {/* Instructions */}
            <p className="text-xs text-slate-500 text-center max-w-[250px]">
                Scannez ce code avec l'autre appareil pour établir la connexion
            </p>
        </div>
    );
});
