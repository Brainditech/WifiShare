// ============================================================================
// WiFiShare - Page ReceiveShare
// Page de réception via Web Share Target API
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Image, Video, File, Send, ArrowLeft } from 'lucide-react';
import { DeviceCard } from '../components/DeviceCard';
import { useAppStore, useDiscoveredDevices, useSelectedDevice } from '../store';
import { type Device, DeviceType, createDeviceId } from '../types';

interface SharedFile {
    name: string;
    type: string;
    size: number;
    file?: File;
}

export function ReceiveSharePage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const discoveredDevices = useDiscoveredDevices();
    const selectedDevice = useSelectedDevice();
    const { selectDevice, addDiscoveredDevice } = useAppStore();

    const [sharedFiles, _setSharedFiles] = useState<SharedFile[]>([]);
    const [sharedText, setSharedText] = useState<string>('');
    const [sharedUrl, setSharedUrl] = useState<string>('');

    // Parse share target data from URL params
    useEffect(() => {
        // title is available via searchParams.get('title') if needed
        const text = searchParams.get('text') ?? '';
        const url = searchParams.get('url') ?? '';

        if (text) setSharedText(text);
        if (url) setSharedUrl(url);

        // In a real implementation, files would come from FormData
        // via a Service Worker that intercepts the POST request
        // For now, we'll simulate with URL params

        // Check for files in service worker cache
        if ('serviceWorker' in navigator) {
            // This would normally communicate with the service worker
            // to retrieve cached files from the share target POST
        }

        // Add mock devices for demonstration
        const mockDevices: Device[] = [
            {
                id: createDeviceId(),
                name: 'MacBook Pro',
                type: DeviceType.DESKTOP,
                ipAddress: '192.168.1.15',
                port: 3001,
                lastSeen: Date.now(),
                isOnline: true
            }
        ];

        mockDevices.forEach(device => addDiscoveredDevice(device));
    }, [searchParams, addDiscoveredDevice]);

    const getFileIcon = (type: string) => {
        if (type.startsWith('image/')) return Image;
        if (type.startsWith('video/')) return Video;
        if (type.startsWith('text/')) return FileText;
        return File;
    };

    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    const handleSend = () => {
        if (selectedDevice) {
            navigate('/transfer', {
                state: {
                    files: sharedFiles.map(f => f.file).filter(Boolean),
                    targetDevice: selectedDevice,
                    direction: 'send'
                }
            });
        }
    };

    const hasContent = sharedFiles.length > 0 || sharedText || sharedUrl;

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 safe-area-top safe-area-bottom">
            {/* Header */}
            <header className="px-6 pt-8 pb-6">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Retour</span>
                </button>

                <h1 className="text-2xl font-bold text-white">Partager vers WiFiShare</h1>
                <p className="text-slate-400 mt-1">
                    Sélectionnez un appareil pour envoyer le contenu
                </p>
            </header>

            {/* Main Content */}
            <main className="px-6 pb-24 space-y-6">
                {/* Shared Content Preview */}
                {hasContent && (
                    <div className="card p-4">
                        <h2 className="text-sm font-medium text-slate-400 mb-3">Contenu à partager</h2>

                        {/* Files */}
                        {sharedFiles.length > 0 && (
                            <div className="space-y-2 mb-4">
                                {sharedFiles.map((file, index) => {
                                    const Icon = getFileIcon(file.type);
                                    return (
                                        <div
                                            key={index}
                                            className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center">
                                                <Icon className="w-5 h-5 text-slate-300" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-white truncate">{file.name}</p>
                                                <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Text */}
                        {sharedText && (
                            <div className="p-3 bg-slate-700/50 rounded-xl mb-4">
                                <p className="text-sm text-white">{sharedText}</p>
                            </div>
                        )}

                        {/* URL */}
                        {sharedUrl && (
                            <div className="p-3 bg-slate-700/50 rounded-xl">
                                <p className="text-xs text-slate-400 mb-1">URL</p>
                                <a
                                    href={sharedUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-primary-400 hover:text-primary-300 break-all"
                                >
                                    {sharedUrl}
                                </a>
                            </div>
                        )}

                        {/* No content message */}
                        {!hasContent && (
                            <div className="py-8 text-center">
                                <p className="text-slate-400">Aucun contenu partagé</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Device List */}
                <div className="card p-4">
                    <h2 className="text-sm font-medium text-slate-400 mb-3">
                        Envoyer vers
                    </h2>

                    {discoveredDevices.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-slate-400">Recherche d'appareils...</p>
                            <div className="mt-4 flex justify-center">
                                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {discoveredDevices.map((device) => (
                                <DeviceCard
                                    key={device.id}
                                    device={device}
                                    isSelected={selectedDevice?.id === device.id}
                                    onClick={() => selectDevice(device)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Send Button */}
            {selectedDevice && (
                <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent">
                    <button
                        onClick={handleSend}
                        className="w-full btn btn-primary py-4"
                    >
                        <Send className="w-5 h-5" />
                        Envoyer à {selectedDevice.name}
                    </button>
                </div>
            )}
        </div>
    );
}
