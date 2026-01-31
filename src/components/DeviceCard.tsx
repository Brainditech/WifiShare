// ============================================================================
// WiFiShare - Composant DeviceCard
// Carte d'appareil avec animation et statut
// ============================================================================

import { memo } from 'react';
import { Smartphone, Monitor, Tablet, HelpCircle, Wifi, WifiOff } from 'lucide-react';
import { type Device, DeviceType } from '../types';

interface DeviceCardProps {
    device: Device;
    isSelected: boolean;
    onClick: () => void;
}

const getDeviceIcon = (type: DeviceType) => {
    switch (type) {
        case DeviceType.MOBILE:
            return Smartphone;
        case DeviceType.DESKTOP:
            return Monitor;
        case DeviceType.TABLET:
            return Tablet;
        default:
            return HelpCircle;
    }
};

const getDeviceTypeName = (type: DeviceType): string => {
    switch (type) {
        case DeviceType.MOBILE:
            return 'Mobile';
        case DeviceType.DESKTOP:
            return 'Ordinateur';
        case DeviceType.TABLET:
            return 'Tablette';
        default:
            return 'Appareil';
    }
};

export const DeviceCard = memo(function DeviceCard({
    device,
    isSelected,
    onClick
}: DeviceCardProps) {
    const Icon = getDeviceIcon(device.type);
    const typeName = getDeviceTypeName(device.type);

    return (
        <button
            onClick={onClick}
            className={`
        w-full p-4 rounded-2xl border transition-all duration-300
        flex items-center gap-4 text-left
        ${isSelected
                    ? 'bg-primary-500/20 border-primary-500 shadow-lg shadow-primary-500/20'
                    : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600 hover:bg-slate-700/50'
                }
        ${isSelected ? 'animate-glow-pulse' : ''}
      `}
        >
            {/* Device Icon */}
            <div className={`
        w-14 h-14 rounded-xl flex items-center justify-center
        transition-all duration-300
        ${isSelected
                    ? 'bg-gradient-to-br from-primary-500 to-accent-500'
                    : 'bg-slate-700'
                }
      `}>
                <Icon className="w-7 h-7 text-white" />
            </div>

            {/* Device Info */}
            <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white truncate">
                    {device.name}
                </h3>
                <p className="text-sm text-slate-400">
                    {typeName}
                </p>
            </div>

            {/* Status Indicator */}
            <div className="flex items-center gap-2">
                {device.isOnline ? (
                    <>
                        <Wifi className="w-4 h-4 text-green-400" />
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                    </>
                ) : (
                    <>
                        <WifiOff className="w-4 h-4 text-slate-500" />
                        <span className="w-3 h-3 rounded-full bg-slate-500"></span>
                    </>
                )}
            </div>
        </button>
    );
});
