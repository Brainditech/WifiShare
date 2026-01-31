// ============================================================================
// WiFiShare - Configuration globale sécurisée
// ============================================================================

import type {
    FileValidationConfig,
    TransferConfig,
    SignalingConfig,
    WebRTCConfig
} from '../types';

// ============================================================================
// File Validation Configuration
// ============================================================================

export const FILE_VALIDATION_CONFIG: FileValidationConfig = {
    maxSizeBytes: 100 * 1024 * 1024, // 100 MB
    allowedMimeTypes: [
        // Images
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'image/bmp',
        'image/heic',
        'image/heif',
        // Videos
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
        // Audio
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'audio/webm',
        'audio/aac',
        'audio/flac',
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        // Text
        'text/plain',
        'text/html',
        'text/css',
        'text/javascript',
        'text/markdown',
        'text/csv',
        // Archives
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'application/gzip',
        // Other
        'application/json',
        'application/xml',
        'application/octet-stream' // Fallback for unknown types
    ],
    sanitizeFileName: true
};

// ============================================================================
// Transfer Configuration
// ============================================================================

export const TRANSFER_CONFIG: TransferConfig = {
    chunkSizeBytes: 16 * 1024, // 16 KB chunks
    maxRetries: 3,
    timeoutMs: 30000, // 30 seconds
    enableCompression: false // Compression can be enabled for text files
};

// ============================================================================
// Signaling Configuration
// ============================================================================

export const SIGNALING_CONFIG: SignalingConfig = {
    portRange: [3000, 3010] as const,
    maxRequestsPerSecond: 10,
    sessionTimeoutMs: 5 * 60 * 1000, // 5 minutes
    pollingIntervalMs: 500, // Initial polling interval
    maxBackoffMs: 8000 // Maximum backoff for exponential retry
};

// ============================================================================
// WebRTC Configuration (Sécurisée)
// ============================================================================

export const WEBRTC_CONFIG: WebRTCConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
        // TURN servers can be added here for NAT traversal
        // { urls: 'turn:your-turn-server.com', username: '...', credential: '...' }
    ],
    iceTransportPolicy: 'all', // Use 'relay' to force TURN for maximum privacy
    iceCandidatePoolSize: 2,
    connectionTimeoutMs: 30000, // 30 seconds
    iceGatheringTimeoutMs: 15000 // 15 seconds
};

// ============================================================================
// Application Constants
// ============================================================================

export const APP_CONFIG = {
    appName: 'WiFiShare',
    version: '1.0.0',
    supportedProtocol: 'wifishare-v1',

    // Device detection
    deviceNamePrefix: 'WiFiShare-',

    // Timeouts
    deviceDiscoveryTimeoutMs: 5000,
    deviceHeartbeatIntervalMs: 10000,
    deviceOfflineThresholdMs: 30000,

    // UI
    toastDurationMs: 3000,
    animationDurationMs: 300,

    // Storage keys
    storageKeys: {
        deviceId: 'wifishare-device-id',
        deviceName: 'wifishare-device-name',
        preferences: 'wifishare-preferences'
    }
} as const;

// ============================================================================
// Error Messages (Localized - French)
// ============================================================================

export const ERROR_MESSAGES: Record<string, string> = {
    CONNECTION_FAILED: 'Impossible de se connecter à l\'appareil distant',
    PEER_UNREACHABLE: 'L\'appareil est inaccessible',
    FILE_TOO_LARGE: `Le fichier dépasse la taille maximale autorisée (${FILE_VALIDATION_CONFIG.maxSizeBytes / 1024 / 1024} MB)`,
    INVALID_FILE_TYPE: 'Ce type de fichier n\'est pas pris en charge',
    NETWORK_INTERRUPTED: 'La connexion réseau a été interrompue',
    CHECKSUM_MISMATCH: 'Le fichier reçu est corrompu, veuillez réessayer',
    TIMEOUT: 'La connexion a expiré',
    CANCELLED: 'Le transfert a été annulé',
    SIGNALING_FAILED: 'Impossible d\'établir la connexion de signalisation',
    RATE_LIMITED: 'Trop de requêtes, veuillez patienter',
    UNKNOWN: 'Une erreur inattendue s\'est produite'
} as const;
