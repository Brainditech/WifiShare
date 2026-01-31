// ============================================================================
// WiFiShare - Page Transfer
// Page de transfert avec progression et contrôles
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Check, AlertCircle, Download, ArrowLeft } from 'lucide-react';
import { ProgressRing } from '../components/ProgressRing';
import { type Device, type TransferProgress } from '../types';

interface LocationState {
    files?: File[];
    targetDevice?: Device;
    direction: 'send' | 'receive';
}

export function TransferPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const state = location.state as LocationState | null;

    const [progress, setProgress] = useState<TransferProgress | null>(null);
    const [status, setStatus] = useState<'connecting' | 'transferring' | 'completed' | 'error'>('connecting');
    const [_errorMessage, _setErrorMessage] = useState<string>('');

    // Simulate transfer progress
    useEffect(() => {
        if (!state?.files || !state?.targetDevice) {
            navigate('/');
            return;
        }

        const totalBytes = state.files.reduce((sum, f) => sum + f.size, 0);
        const fileName = state.files[0]?.name ?? 'Fichier';

        // Simulate connecting
        const connectTimeout = setTimeout(() => {
            setStatus('transferring');

            // Simulate progress
            let transferred = 0;
            const interval = setInterval(() => {
                transferred += Math.random() * totalBytes * 0.1;

                if (transferred >= totalBytes) {
                    transferred = totalBytes;
                    clearInterval(interval);
                    setStatus('completed');
                }

                const elapsed = Date.now() - startTime;
                const speed = transferred / (elapsed / 1000);
                const remaining = totalBytes - transferred;
                const eta = speed > 0 ? (remaining / speed) * 1000 : 0;

                setProgress({
                    transferId: 'mock-transfer' as any,
                    fileName,
                    totalBytes,
                    transferredBytes: Math.min(transferred, totalBytes),
                    percentage: Math.min((transferred / totalBytes) * 100, 100),
                    speed,
                    estimatedTimeRemaining: eta,
                    currentChunk: Math.floor((transferred / totalBytes) * 100),
                    totalChunks: 100
                });
            }, 200);

            const startTime = Date.now();

            return () => clearInterval(interval);
        }, 1500);

        return () => clearTimeout(connectTimeout);
    }, [state, navigate]);

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    const formatTime = (ms: number): string => {
        if (ms < 1000) return '< 1s';
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const handleCancel = () => {
        // In real app, would cancel the transfer
        navigate('/');
    };

    const handleDone = () => {
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 safe-area-top safe-area-bottom flex flex-col">
            {/* Header */}
            <header className="px-6 pt-8 pb-6">
                {status !== 'transferring' && (
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        <span>Retour</span>
                    </button>
                )}

                <h1 className="text-2xl font-bold text-white">
                    {state?.direction === 'send' ? 'Envoi en cours' : 'Réception en cours'}
                </h1>

                {state?.targetDevice && (
                    <p className="text-slate-400 mt-1">
                        {state.direction === 'send' ? 'Vers' : 'Depuis'} {state.targetDevice.name}
                    </p>
                )}
            </header>

            {/* Main Content */}
            <main className="flex-1 px-6 flex flex-col items-center justify-center">
                {/* Connecting State */}
                {status === 'connecting' && (
                    <div className="text-center animate-slide-up">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-slate-800 flex items-center justify-center">
                            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <p className="text-white font-medium">Connexion en cours...</p>
                        <p className="text-slate-400 text-sm mt-2">
                            Établissement de la connexion P2P
                        </p>
                    </div>
                )}

                {/* Transferring State */}
                {status === 'transferring' && progress && (
                    <div className="text-center w-full max-w-sm animate-slide-up">
                        <ProgressRing
                            progress={progress.percentage}
                            size={160}
                            strokeWidth={12}
                            className="mb-6"
                        />

                        <p className="text-white font-medium truncate px-4">
                            {progress.fileName}
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-slate-800/50 rounded-xl p-3">
                                <p className="text-slate-400">Vitesse</p>
                                <p className="text-white font-medium">
                                    {formatBytes(progress.speed)}/s
                                </p>
                            </div>
                            <div className="bg-slate-800/50 rounded-xl p-3">
                                <p className="text-slate-400">Temps restant</p>
                                <p className="text-white font-medium">
                                    {formatTime(progress.estimatedTimeRemaining)}
                                </p>
                            </div>
                        </div>

                        <p className="text-slate-500 text-xs mt-4">
                            {formatBytes(progress.transferredBytes)} / {formatBytes(progress.totalBytes)}
                        </p>
                    </div>
                )}

                {/* Completed State */}
                {status === 'completed' && (
                    <div className="text-center animate-slide-up">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Check className="w-10 h-10 text-green-400" />
                        </div>
                        <p className="text-white font-medium text-lg">Transfert terminé !</p>
                        <p className="text-slate-400 text-sm mt-2">
                            {state?.files?.length ?? 0} fichier(s) transféré(s) avec succès
                        </p>

                        {state?.direction === 'receive' && (
                            <button className="mt-6 btn btn-primary">
                                <Download className="w-5 h-5" />
                                Télécharger
                            </button>
                        )}
                    </div>
                )}

                {/* Error State */}
                {status === 'error' && (
                    <div className="text-center animate-slide-up">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
                            <AlertCircle className="w-10 h-10 text-red-400" />
                        </div>
                        <p className="text-white font-medium text-lg">Erreur de transfert</p>
                        <p className="text-red-400 text-sm mt-2">{_errorMessage}</p>
                    </div>
                )}
            </main>

            {/* Footer Actions */}
            <footer className="px-6 pb-8">
                {status === 'transferring' && (
                    <button
                        onClick={handleCancel}
                        className="w-full btn btn-secondary py-4"
                    >
                        <X className="w-5 h-5" />
                        Annuler
                    </button>
                )}

                {(status === 'completed' || status === 'error') && (
                    <button
                        onClick={handleDone}
                        className="w-full btn btn-primary py-4"
                    >
                        Terminé
                    </button>
                )}
            </footer>
        </div>
    );
}
