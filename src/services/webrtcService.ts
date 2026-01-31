// ============================================================================
// WiFiShare - Service WebRTC Sécurisé
// Gestion des connexions peer-to-peer avec état machine et timeouts
// ============================================================================

import {
    type ConnectionState,
    type DeviceId,
    type Result,
    type TransferError,
    TransferErrorCode,
    ok,
    err
} from '../types';
import { WEBRTC_CONFIG, ERROR_MESSAGES } from '../config';

// ============================================================================
// Types internes
// ============================================================================

interface WebRTCConnection {
    peerConnection: RTCPeerConnection;
    dataChannel: RTCDataChannel | null;
    state: ConnectionState;
    deviceId: DeviceId;
    createdAt: number;
}

type ConnectionEventHandler = (state: ConnectionState) => void;
type DataHandler = (data: ArrayBuffer | string) => void;
type ErrorHandler = (error: TransferError) => void;

// ============================================================================
// WebRTC Service Class
// ============================================================================

class WebRTCService {
    private connection: WebRTCConnection | null = null;
    private onStateChange: ConnectionEventHandler | null = null;
    private onData: DataHandler | null = null;
    private onError: ErrorHandler | null = null;
    private iceGatheringTimeout: ReturnType<typeof setTimeout> | null = null;
    private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

    // --------------------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------------------

    /**
     * Initialize a new peer connection as the initiator (offerer)
     */
    async createOffer(deviceId: DeviceId): Promise<Result<RTCSessionDescriptionInit, TransferError>> {
        try {
            this.cleanup();

            const peerConnection = this.createPeerConnection(deviceId);

            // Create data channel BEFORE creating offer
            const dataChannel = peerConnection.createDataChannel('wifishare-transfer', {
                ordered: true,
                maxRetransmits: 3
            });

            this.setupDataChannel(dataChannel);

            // Wait for ICE gathering with timeout
            await this.gatherICECandidates(peerConnection);

            // Create offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            this.connection = {
                peerConnection,
                dataChannel,
                state: 'CONNECTING' as ConnectionState,
                deviceId,
                createdAt: Date.now()
            };

            this.startConnectionTimeout();

            return ok(offer);
        } catch (error) {
            const transferError = this.createError(
                TransferErrorCode.CONNECTION_FAILED,
                error instanceof Error ? error.message : 'Failed to create offer'
            );
            this.handleError(transferError);
            return err(transferError);
        }
    }

    /**
     * Handle an incoming offer and create an answer
     */
    async handleOffer(
        deviceId: DeviceId,
        offer: RTCSessionDescriptionInit
    ): Promise<Result<RTCSessionDescriptionInit, TransferError>> {
        try {
            this.cleanup();

            const peerConnection = this.createPeerConnection(deviceId);

            // Set up data channel handler for incoming channel
            peerConnection.ondatachannel = (event) => {
                this.setupDataChannel(event.channel);
                if (this.connection) {
                    this.connection.dataChannel = event.channel;
                }
            };

            // Set remote description (offer)
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            // Create and set answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            // Wait for ICE gathering
            await this.gatherICECandidates(peerConnection);

            this.connection = {
                peerConnection,
                dataChannel: null, // Will be set by ondatachannel
                state: 'CONNECTING' as ConnectionState,
                deviceId,
                createdAt: Date.now()
            };

            this.startConnectionTimeout();

            return ok(answer);
        } catch (error) {
            const transferError = this.createError(
                TransferErrorCode.CONNECTION_FAILED,
                error instanceof Error ? error.message : 'Failed to handle offer'
            );
            this.handleError(transferError);
            return err(transferError);
        }
    }

    /**
     * Handle an incoming answer
     */
    async handleAnswer(answer: RTCSessionDescriptionInit): Promise<Result<void, TransferError>> {
        try {
            if (!this.connection) {
                return err(this.createError(TransferErrorCode.CONNECTION_FAILED, 'No active connection'));
            }

            await this.connection.peerConnection.setRemoteDescription(
                new RTCSessionDescription(answer)
            );

            return ok(undefined);
        } catch (error) {
            const transferError = this.createError(
                TransferErrorCode.CONNECTION_FAILED,
                error instanceof Error ? error.message : 'Failed to handle answer'
            );
            this.handleError(transferError);
            return err(transferError);
        }
    }

    /**
     * Add an ICE candidate from remote peer
     */
    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<Result<void, TransferError>> {
        try {
            if (!this.connection) {
                return err(this.createError(TransferErrorCode.CONNECTION_FAILED, 'No active connection'));
            }

            await this.connection.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            return ok(undefined);
        } catch (error) {
            // ICE candidate errors are often non-fatal
            console.warn('Failed to add ICE candidate:', error);
            return ok(undefined);
        }
    }

    /**
     * Send data through the data channel
     */
    send(data: ArrayBuffer | string): Result<void, TransferError> {
        if (!this.connection?.dataChannel) {
            return err(this.createError(TransferErrorCode.CONNECTION_FAILED, 'Data channel not available'));
        }

        if (this.connection.dataChannel.readyState !== 'open') {
            return err(this.createError(TransferErrorCode.CONNECTION_FAILED, 'Data channel not open'));
        }

        try {
            // Backpressure handling
            if (this.connection.dataChannel.bufferedAmount > 16 * 1024 * 1024) {
                return err(this.createError(TransferErrorCode.NETWORK_INTERRUPTED, 'Buffer full, slow down'));
            }

            this.connection.dataChannel.send(data as ArrayBuffer);
            return ok(undefined);
        } catch (error) {
            const transferError = this.createError(
                TransferErrorCode.NETWORK_INTERRUPTED,
                error instanceof Error ? error.message : 'Failed to send data'
            );
            return err(transferError);
        }
    }

    /**
     * Close and cleanup the connection
     */
    close(): void {
        this.cleanup();
        this.updateState('DISCONNECTED' as ConnectionState);
    }

    /**
     * Get current connection state
     */
    getState(): ConnectionState {
        return (this.connection?.state ?? 'IDLE') as ConnectionState;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connection?.state === 'CONNECTED';
    }

    // --------------------------------------------------------------------------
    // Event Handlers Setup
    // --------------------------------------------------------------------------

    setOnStateChange(handler: ConnectionEventHandler): void {
        this.onStateChange = handler;
    }

    setOnData(handler: DataHandler): void {
        this.onData = handler;
    }

    setOnError(handler: ErrorHandler): void {
        this.onError = handler;
    }

    // --------------------------------------------------------------------------
    // Private Methods
    // --------------------------------------------------------------------------

    private createPeerConnection(_deviceId: DeviceId): RTCPeerConnection {
        const peerConnection = new RTCPeerConnection({
            iceServers: [...WEBRTC_CONFIG.iceServers],
            iceTransportPolicy: WEBRTC_CONFIG.iceTransportPolicy,
            iceCandidatePoolSize: WEBRTC_CONFIG.iceCandidatePoolSize
        });

        // Connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;

            switch (state) {
                case 'connected':
                    this.clearConnectionTimeout();
                    this.updateState('CONNECTED' as ConnectionState);
                    break;
                case 'disconnected':
                case 'failed':
                    this.handleError(
                        this.createError(TransferErrorCode.CONNECTION_FAILED, `Connection ${state}`)
                    );
                    break;
                case 'closed':
                    this.updateState('DISCONNECTED' as ConnectionState);
                    break;
            }
        };

        // ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'failed') {
                this.handleError(
                    this.createError(TransferErrorCode.PEER_UNREACHABLE, 'ICE connection failed')
                );
            }
        };

        return peerConnection;
    }

    private setupDataChannel(channel: RTCDataChannel): void {
        channel.binaryType = 'arraybuffer';

        channel.onopen = () => {
            this.clearConnectionTimeout();
            this.updateState('CONNECTED' as ConnectionState);
        };

        channel.onclose = () => {
            this.updateState('DISCONNECTED' as ConnectionState);
        };

        channel.onerror = (event) => {
            console.error('DataChannel error:', event);
            this.handleError(
                this.createError(TransferErrorCode.NETWORK_INTERRUPTED, 'Data channel error')
            );
        };

        channel.onmessage = (event) => {
            if (this.onData) {
                this.onData(event.data as ArrayBuffer | string);
            }
        };
    }

    private async gatherICECandidates(peerConnection: RTCPeerConnection): Promise<RTCIceCandidate[]> {
        return new Promise((resolve) => {
            const candidates: RTCIceCandidate[] = [];

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    candidates.push(event.candidate);
                }
            };

            // Timeout for ICE gathering
            this.iceGatheringTimeout = setTimeout(() => {
                resolve(candidates);
            }, WEBRTC_CONFIG.iceGatheringTimeoutMs);

            peerConnection.onicegatheringstatechange = () => {
                if (peerConnection.iceGatheringState === 'complete') {
                    if (this.iceGatheringTimeout) {
                        clearTimeout(this.iceGatheringTimeout);
                    }
                    resolve(candidates);
                }
            };
        });
    }

    private startConnectionTimeout(): void {
        this.connectionTimeout = setTimeout(() => {
            this.handleError(
                this.createError(TransferErrorCode.TIMEOUT, 'Connection timeout')
            );
        }, WEBRTC_CONFIG.connectionTimeoutMs);
    }

    private clearConnectionTimeout(): void {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
    }

    private updateState(state: ConnectionState): void {
        if (this.connection) {
            this.connection.state = state;
        }
        if (this.onStateChange) {
            this.onStateChange(state);
        }
    }

    private handleError(error: TransferError): void {
        this.updateState('ERROR' as ConnectionState);
        if (this.onError) {
            this.onError(error);
        }
        this.cleanup();
    }

    private createError(code: TransferErrorCode, details?: string): TransferError {
        return {
            code,
            message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN,
            details,
            timestamp: Date.now(),
            recoverable: code !== TransferErrorCode.FILE_TOO_LARGE && code !== TransferErrorCode.INVALID_FILE_TYPE
        };
    }

    private cleanup(): void {
        this.clearConnectionTimeout();

        if (this.iceGatheringTimeout) {
            clearTimeout(this.iceGatheringTimeout);
            this.iceGatheringTimeout = null;
        }

        if (this.connection) {
            if (this.connection.dataChannel) {
                this.connection.dataChannel.close();
            }
            this.connection.peerConnection.close();
            this.connection = null;
        }
    }
}

// Singleton export
export const webrtcService = new WebRTCService();
export type { WebRTCService };
