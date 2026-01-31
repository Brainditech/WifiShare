// ============================================================================
// WiFiShare - Types TypeScript Stricts
// Aucun 'any' autorisé - Types sécurisés et validés
// ============================================================================

// ============================================================================
// Branded Types pour IDs sécurisés
// ============================================================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type SessionId = Brand<string, 'SessionId'>;
export type DeviceId = Brand<string, 'DeviceId'>;
export type TransferId = Brand<string, 'TransferId'>;

// Factory functions pour créer des branded types de manière sécurisée
export function createSessionId(): SessionId {
    return crypto.randomUUID() as SessionId;
}

export function createDeviceId(): DeviceId {
    return crypto.randomUUID() as DeviceId;
}

export function createTransferId(): TransferId {
    return crypto.randomUUID() as TransferId;
}

// ============================================================================
// Result Pattern pour gestion d'erreurs type-safe
// ============================================================================

export type Result<T, E = Error> =
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: E };

export function ok<T>(data: T): Result<T, never> {
    return { success: true, data };
}

export function err<E>(error: E): Result<never, E> {
    return { success: false, error };
}

// ============================================================================
// Const Objects (remplace enums pour compatibilité erasableSyntaxOnly)
// ============================================================================

export const ConnectionState = {
    IDLE: 'IDLE',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    TRANSFERRING: 'TRANSFERRING',
    COMPLETED: 'COMPLETED',
    ERROR: 'ERROR',
    DISCONNECTED: 'DISCONNECTED'
} as const;
export type ConnectionState = typeof ConnectionState[keyof typeof ConnectionState];

export const TransferDirection = {
    SEND: 'SEND',
    RECEIVE: 'RECEIVE'
} as const;
export type TransferDirection = typeof TransferDirection[keyof typeof TransferDirection];

export const DeviceType = {
    DESKTOP: 'DESKTOP',
    MOBILE: 'MOBILE',
    TABLET: 'TABLET',
    UNKNOWN: 'UNKNOWN'
} as const;
export type DeviceType = typeof DeviceType[keyof typeof DeviceType];

export const TransferErrorCode = {
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    PEER_UNREACHABLE: 'PEER_UNREACHABLE',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
    NETWORK_INTERRUPTED: 'NETWORK_INTERRUPTED',
    CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
    TIMEOUT: 'TIMEOUT',
    CANCELLED: 'CANCELLED',
    SIGNALING_FAILED: 'SIGNALING_FAILED',
    RATE_LIMITED: 'RATE_LIMITED',
    UNKNOWN: 'UNKNOWN'
} as const;
export type TransferErrorCode = typeof TransferErrorCode[keyof typeof TransferErrorCode];

// ============================================================================
// Interfaces Core
// ============================================================================

export interface Device {
    readonly id: DeviceId;
    readonly name: string;
    readonly type: DeviceType;
    readonly ipAddress: string;
    readonly port: number;
    readonly lastSeen: number;
    readonly isOnline: boolean;
}

export interface FileMetadata {
    readonly name: string;
    readonly size: number;
    readonly type: string;
    readonly lastModified: number;
    readonly checksum?: string;
}

export interface TransferProgress {
    readonly transferId: TransferId;
    readonly fileName: string;
    readonly totalBytes: number;
    readonly transferredBytes: number;
    readonly percentage: number;
    readonly speed: number; // bytes per second
    readonly estimatedTimeRemaining: number; // milliseconds
    readonly currentChunk: number;
    readonly totalChunks: number;
}

export interface TransferState {
    readonly transferId: TransferId;
    readonly direction: TransferDirection;
    readonly connectionState: ConnectionState;
    readonly files: readonly FileMetadata[];
    readonly progress: TransferProgress | null;
    readonly startedAt: number | null;
    readonly completedAt: number | null;
    readonly error: TransferError | null;
}

export interface TransferError {
    readonly code: TransferErrorCode;
    readonly message: string;
    readonly details?: string;
    readonly timestamp: number;
    readonly recoverable: boolean;
}

// ============================================================================
// Messages de transfert (Discriminated Unions)
// ============================================================================

export interface ChunkData {
    readonly index: number;
    readonly data: ArrayBuffer;
    readonly checksum: string;
    readonly isLast: boolean;
}

export interface ChunkAck {
    readonly index: number;
    readonly checksum: string;
    readonly success: boolean;
}

export type TransferMessage =
    | { readonly type: 'FILE_METADATA'; readonly payload: FileMetadata }
    | { readonly type: 'CHUNK'; readonly payload: ChunkData }
    | { readonly type: 'CHUNK_ACK'; readonly payload: ChunkAck }
    | { readonly type: 'TRANSFER_COMPLETE'; readonly payload: { readonly finalChecksum: string } }
    | { readonly type: 'TRANSFER_ERROR'; readonly payload: TransferError }
    | { readonly type: 'TRANSFER_CANCEL'; readonly payload: { readonly reason: string } };

// ============================================================================
// Signaling Types
// ============================================================================

export interface SignalingOffer {
    readonly sessionId: SessionId;
    readonly sdp: string;
    readonly iceCandidates: readonly RTCIceCandidateInit[];
    readonly deviceInfo: Pick<Device, 'name' | 'type'>;
}

export interface SignalingAnswer {
    readonly sessionId: SessionId;
    readonly sdp: string;
    readonly iceCandidates: readonly RTCIceCandidateInit[];
    readonly deviceInfo: Pick<Device, 'name' | 'type'>;
}

export interface SignalingCandidate {
    readonly sessionId: SessionId;
    readonly candidate: RTCIceCandidateInit;
}

export type SignalingMessage =
    | { readonly type: 'OFFER'; readonly payload: SignalingOffer }
    | { readonly type: 'ANSWER'; readonly payload: SignalingAnswer }
    | { readonly type: 'CANDIDATE'; readonly payload: SignalingCandidate }
    | { readonly type: 'CLOSE'; readonly payload: { readonly sessionId: SessionId } };

// ============================================================================
// Configuration Types
// ============================================================================

export interface FileValidationConfig {
    readonly maxSizeBytes: number;
    readonly allowedMimeTypes: readonly string[];
    readonly sanitizeFileName: boolean;
}

export interface TransferConfig {
    readonly chunkSizeBytes: number;
    readonly maxRetries: number;
    readonly timeoutMs: number;
    readonly enableCompression: boolean;
}

export interface SignalingConfig {
    readonly portRange: readonly [number, number];
    readonly maxRequestsPerSecond: number;
    readonly sessionTimeoutMs: number;
    readonly pollingIntervalMs: number;
    readonly maxBackoffMs: number;
}

export interface WebRTCConfig {
    readonly iceServers: readonly RTCIceServer[];
    readonly iceTransportPolicy: RTCIceTransportPolicy;
    readonly iceCandidatePoolSize: number;
    readonly connectionTimeoutMs: number;
    readonly iceGatheringTimeoutMs: number;
}

// ============================================================================
// Store Types (Zustand)
// ============================================================================

export interface AppState {
    // Device state
    readonly currentDevice: Device | null;
    readonly discoveredDevices: readonly Device[];
    readonly selectedDevice: Device | null;

    // Transfer state
    readonly transfers: readonly TransferState[];
    readonly activeTransfer: TransferState | null;

    // Connection state
    readonly connectionState: ConnectionState;
    readonly sessionId: SessionId | null;

    // UI state
    readonly isScanning: boolean;
    readonly error: TransferError | null;
}

export interface AppActions {
    // Device actions
    setCurrentDevice: (device: Device) => void;
    addDiscoveredDevice: (device: Device) => void;
    removeDiscoveredDevice: (deviceId: DeviceId) => void;
    selectDevice: (device: Device | null) => void;
    clearDevices: () => void;

    // Transfer actions
    startTransfer: (files: File[], targetDevice: Device) => Promise<Result<TransferId, TransferError>>;
    cancelTransfer: (transferId: TransferId) => void;
    updateTransferProgress: (progress: TransferProgress) => void;
    completeTransfer: (transferId: TransferId) => void;
    failTransfer: (transferId: TransferId, error: TransferError) => void;

    // Connection actions
    setConnectionState: (state: ConnectionState) => void;
    setSessionId: (sessionId: SessionId | null) => void;

    // UI actions
    setScanning: (isScanning: boolean) => void;
    setError: (error: TransferError | null) => void;
    clearError: () => void;
    reset: () => void;
}

export type AppStore = AppState & AppActions;

// ============================================================================
// Utility Types
// ============================================================================

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type DeepReadonly<T> = T extends (infer R)[]
    ? ReadonlyArray<DeepReadonly<R>>
    : T extends object
    ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
    : T;

// Type guard functions
export function isTransferError(value: unknown): value is TransferError {
    return (
        typeof value === 'object' &&
        value !== null &&
        'code' in value &&
        'message' in value &&
        'timestamp' in value &&
        'recoverable' in value
    );
}

export function isFileMetadata(value: unknown): value is FileMetadata {
    return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        'size' in value &&
        'type' in value &&
        'lastModified' in value
    );
}

export function isDevice(value: unknown): value is Device {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        'name' in value &&
        'type' in value &&
        'ipAddress' in value &&
        'port' in value
    );
}
