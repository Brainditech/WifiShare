// ============================================================================
// WiFiShare - Store Zustand Global
// State management typé et sécurisé
// ============================================================================

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
    type AppStore,
    type Device,
    type DeviceId,
    type TransferState,
    type TransferProgress,
    type TransferError,
    type TransferId,
    type Result,
    ConnectionState,
    TransferDirection,
    DeviceType,
    createDeviceId,
    ok
} from '../types';
import { APP_CONFIG } from '../config';

// ============================================================================
// Initial State
// ============================================================================

const getInitialDevice = (): Device => {
    // Try to get stored device ID or create new one
    const storedId = localStorage.getItem(APP_CONFIG.storageKeys.deviceId);
    const storedName = localStorage.getItem(APP_CONFIG.storageKeys.deviceName);

    const deviceId = (storedId as DeviceId) || createDeviceId();
    const deviceName = storedName || `${APP_CONFIG.deviceNamePrefix}${deviceId.slice(0, 6)}`;

    // Store for future sessions
    if (!storedId) {
        localStorage.setItem(APP_CONFIG.storageKeys.deviceId, deviceId);
        localStorage.setItem(APP_CONFIG.storageKeys.deviceName, deviceName);
    }

    return {
        id: deviceId,
        name: deviceName,
        type: detectDeviceType(),
        ipAddress: '',
        port: 0,
        lastSeen: Date.now(),
        isOnline: true
    };
};

const detectDeviceType = (): DeviceType => {
    if (typeof navigator === 'undefined') return DeviceType.UNKNOWN;

    const ua = navigator.userAgent.toLowerCase();

    if (/tablet|ipad|playbook|silk/i.test(ua)) {
        return DeviceType.TABLET;
    }

    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
        return DeviceType.MOBILE;
    }

    return DeviceType.DESKTOP;
};

const initialState = {
    currentDevice: null as Device | null,
    discoveredDevices: [] as readonly Device[],
    selectedDevice: null as Device | null,
    transfers: [] as readonly TransferState[],
    activeTransfer: null as TransferState | null,
    connectionState: ConnectionState.IDLE,
    sessionId: null,
    isScanning: false,
    error: null as TransferError | null
};

// ============================================================================
// Store
// ============================================================================

export const useAppStore = create<AppStore>()(
    devtools(
        (set, get) => ({
            ...initialState,

            // --------------------------------------------------------------------------
            // Device Actions
            // --------------------------------------------------------------------------

            setCurrentDevice: (device: Device) => {
                set({ currentDevice: device }, false, 'setCurrentDevice');
            },

            addDiscoveredDevice: (device: Device) => {
                set((state) => {
                    // Don't add self
                    if (state.currentDevice && device.id === state.currentDevice.id) {
                        return state;
                    }

                    // Update existing or add new
                    const existing = state.discoveredDevices.find(d => d.id === device.id);
                    if (existing) {
                        return {
                            discoveredDevices: state.discoveredDevices.map(d =>
                                d.id === device.id ? { ...device, lastSeen: Date.now() } : d
                            )
                        };
                    }

                    return {
                        discoveredDevices: [...state.discoveredDevices, { ...device, lastSeen: Date.now() }]
                    };
                }, false, 'addDiscoveredDevice');
            },

            removeDiscoveredDevice: (deviceId: DeviceId) => {
                set((state) => ({
                    discoveredDevices: state.discoveredDevices.filter(d => d.id !== deviceId),
                    selectedDevice: state.selectedDevice?.id === deviceId ? null : state.selectedDevice
                }), false, 'removeDiscoveredDevice');
            },

            selectDevice: (device: Device | null) => {
                set({ selectedDevice: device }, false, 'selectDevice');
            },

            clearDevices: () => {
                set({ discoveredDevices: [], selectedDevice: null }, false, 'clearDevices');
            },

            // --------------------------------------------------------------------------
            // Transfer Actions
            // --------------------------------------------------------------------------

            startTransfer: async (files: File[], _targetDevice: Device): Promise<Result<TransferId, TransferError>> => {
                // This is a placeholder - actual implementation will use services
                const transferId = crypto.randomUUID() as TransferId;

                const newTransfer: TransferState = {
                    transferId,
                    direction: TransferDirection.SEND,
                    connectionState: ConnectionState.CONNECTING,
                    files: files.map(f => ({
                        name: f.name,
                        size: f.size,
                        type: f.type,
                        lastModified: f.lastModified
                    })),
                    progress: null,
                    startedAt: Date.now(),
                    completedAt: null,
                    error: null
                };

                set((state) => ({
                    transfers: [...state.transfers, newTransfer],
                    activeTransfer: newTransfer,
                    connectionState: ConnectionState.CONNECTING
                }), false, 'startTransfer');

                return ok(transferId);
            },

            cancelTransfer: (transferId: TransferId) => {
                set((state) => ({
                    transfers: state.transfers.map(t =>
                        t.transferId === transferId
                            ? { ...t, connectionState: ConnectionState.DISCONNECTED }
                            : t
                    ),
                    activeTransfer: state.activeTransfer?.transferId === transferId
                        ? null
                        : state.activeTransfer,
                    connectionState: state.activeTransfer?.transferId === transferId
                        ? ConnectionState.IDLE
                        : state.connectionState
                }), false, 'cancelTransfer');
            },

            updateTransferProgress: (progress: TransferProgress) => {
                set((state) => ({
                    transfers: state.transfers.map(t =>
                        t.transferId === progress.transferId
                            ? { ...t, progress, connectionState: ConnectionState.TRANSFERRING }
                            : t
                    ),
                    activeTransfer: state.activeTransfer?.transferId === progress.transferId
                        ? { ...state.activeTransfer, progress, connectionState: ConnectionState.TRANSFERRING }
                        : state.activeTransfer,
                    connectionState: ConnectionState.TRANSFERRING
                }), false, 'updateTransferProgress');
            },

            completeTransfer: (transferId: TransferId) => {
                set((state) => ({
                    transfers: state.transfers.map(t =>
                        t.transferId === transferId
                            ? { ...t, connectionState: ConnectionState.COMPLETED, completedAt: Date.now() }
                            : t
                    ),
                    activeTransfer: state.activeTransfer?.transferId === transferId
                        ? { ...state.activeTransfer, connectionState: ConnectionState.COMPLETED, completedAt: Date.now() }
                        : state.activeTransfer,
                    connectionState: ConnectionState.COMPLETED
                }), false, 'completeTransfer');
            },

            failTransfer: (transferId: TransferId, error: TransferError) => {
                set((state) => ({
                    transfers: state.transfers.map(t =>
                        t.transferId === transferId
                            ? { ...t, connectionState: ConnectionState.ERROR, error }
                            : t
                    ),
                    activeTransfer: state.activeTransfer?.transferId === transferId
                        ? { ...state.activeTransfer, connectionState: ConnectionState.ERROR, error }
                        : state.activeTransfer,
                    connectionState: ConnectionState.ERROR,
                    error
                }), false, 'failTransfer');
            },

            // --------------------------------------------------------------------------
            // Connection Actions
            // --------------------------------------------------------------------------

            setConnectionState: (state: ConnectionState) => {
                set({ connectionState: state }, false, 'setConnectionState');
            },

            setSessionId: (sessionId) => {
                set({ sessionId }, false, 'setSessionId');
            },

            // --------------------------------------------------------------------------
            // UI Actions
            // --------------------------------------------------------------------------

            setScanning: (isScanning: boolean) => {
                set({ isScanning }, false, 'setScanning');
            },

            setError: (error: TransferError | null) => {
                set({ error }, false, 'setError');
            },

            clearError: () => {
                set({ error: null }, false, 'clearError');
            },

            reset: () => {
                set({
                    ...initialState,
                    currentDevice: get().currentDevice // Keep device identity
                }, false, 'reset');
            }
        }),
        { name: 'WiFiShare' }
    )
);

// Initialize current device on store creation
if (typeof window !== 'undefined') {
    const store = useAppStore.getState();
    if (!store.currentDevice) {
        store.setCurrentDevice(getInitialDevice());
    }
}

// Export hooks for specific slices
export const useCurrentDevice = () => useAppStore((state) => state.currentDevice);
export const useDiscoveredDevices = () => useAppStore((state) => state.discoveredDevices);
export const useSelectedDevice = () => useAppStore((state) => state.selectedDevice);
export const useActiveTransfer = () => useAppStore((state) => state.activeTransfer);
export const useConnectionState = () => useAppStore((state) => state.connectionState);
export const useIsScanning = () => useAppStore((state) => state.isScanning);
export const useError = () => useAppStore((state) => state.error);
