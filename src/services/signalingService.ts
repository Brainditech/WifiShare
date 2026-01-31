// ============================================================================
// WiFiShare - Service de Signaling Local Sécurisé
// Communication HTTP locale avec rate limiting et session management
// ============================================================================

import {
    type SessionId,
    type SignalingOffer,
    type SignalingAnswer,
    type SignalingMessage,
    type Result,
    type TransferError,
    TransferErrorCode,
    createSessionId,
    ok,
    err
} from '../types';
import { SIGNALING_CONFIG, ERROR_MESSAGES } from '../config';

// ============================================================================
// Types internes
// ============================================================================

interface SignalingSession {
    sessionId: SessionId;
    offer: SignalingOffer | null;
    answer: SignalingAnswer | null;
    candidates: RTCIceCandidateInit[];
    createdAt: number;
    lastActivity: number;
}

interface RateLimiter {
    requests: number[];
    maxPerSecond: number;
}

// ============================================================================
// Signaling Service Class
// ============================================================================

class SignalingService {
    private sessions: Map<SessionId, SignalingSession> = new Map();
    private rateLimiter: RateLimiter = {
        requests: [],
        maxPerSecond: SIGNALING_CONFIG.maxRequestsPerSecond
    };
    private pollingInterval: ReturnType<typeof setInterval> | null = null;
    private currentBackoff: number = SIGNALING_CONFIG.pollingIntervalMs;

    // --------------------------------------------------------------------------
    // Session Management
    // --------------------------------------------------------------------------

    /**
     * Create a new signaling session
     */
    createSession(): SessionId {
        const sessionId = createSessionId();

        const session: SignalingSession = {
            sessionId,
            offer: null,
            answer: null,
            candidates: [],
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

        this.sessions.set(sessionId, session);
        this.cleanupExpiredSessions();

        return sessionId;
    }

    /**
     * Get session by ID
     */
    getSession(sessionId: SessionId): SignalingSession | null {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
        }
        return session ?? null;
    }

    /**
     * Close and cleanup a session
     */
    closeSession(sessionId: SessionId): void {
        this.sessions.delete(sessionId);
    }

    // --------------------------------------------------------------------------
    // Rate Limiting (Sécurité)
    // --------------------------------------------------------------------------

    /**
     * Check if request is allowed (rate limiting)
     */
    private checkRateLimit(): boolean {
        const now = Date.now();
        // Remove requests older than 1 second
        this.rateLimiter.requests = this.rateLimiter.requests.filter(
            t => now - t < 1000
        );

        if (this.rateLimiter.requests.length >= this.rateLimiter.maxPerSecond) {
            return false;
        }

        this.rateLimiter.requests.push(now);
        return true;
    }

    // --------------------------------------------------------------------------
    // Signaling Operations
    // --------------------------------------------------------------------------

    /**
     * Store an offer in a session
     */
    storeOffer(sessionId: SessionId, offer: SignalingOffer): Result<void, TransferError> {
        if (!this.checkRateLimit()) {
            return err(this.createError(TransferErrorCode.RATE_LIMITED));
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return err(this.createError(TransferErrorCode.SIGNALING_FAILED, 'Session not found'));
        }

        session.offer = offer;
        session.lastActivity = Date.now();

        return ok(undefined);
    }

    /**
     * Get stored offer
     */
    getOffer(sessionId: SessionId): Result<SignalingOffer | null, TransferError> {
        if (!this.checkRateLimit()) {
            return err(this.createError(TransferErrorCode.RATE_LIMITED));
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return err(this.createError(TransferErrorCode.SIGNALING_FAILED, 'Session not found'));
        }

        return ok(session.offer);
    }

    /**
     * Store an answer in a session
     */
    storeAnswer(sessionId: SessionId, answer: SignalingAnswer): Result<void, TransferError> {
        if (!this.checkRateLimit()) {
            return err(this.createError(TransferErrorCode.RATE_LIMITED));
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return err(this.createError(TransferErrorCode.SIGNALING_FAILED, 'Session not found'));
        }

        session.answer = answer;
        session.lastActivity = Date.now();

        return ok(undefined);
    }

    /**
     * Get stored answer
     */
    getAnswer(sessionId: SessionId): Result<SignalingAnswer | null, TransferError> {
        if (!this.checkRateLimit()) {
            return err(this.createError(TransferErrorCode.RATE_LIMITED));
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return err(this.createError(TransferErrorCode.SIGNALING_FAILED, 'Session not found'));
        }

        return ok(session.answer);
    }

    /**
     * Add ICE candidate
     */
    addCandidate(sessionId: SessionId, candidate: RTCIceCandidateInit): Result<void, TransferError> {
        if (!this.checkRateLimit()) {
            return err(this.createError(TransferErrorCode.RATE_LIMITED));
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return err(this.createError(TransferErrorCode.SIGNALING_FAILED, 'Session not found'));
        }

        session.candidates.push(candidate);
        session.lastActivity = Date.now();

        return ok(undefined);
    }

    /**
     * Get all ICE candidates
     */
    getCandidates(sessionId: SessionId): Result<readonly RTCIceCandidateInit[], TransferError> {
        if (!this.checkRateLimit()) {
            return err(this.createError(TransferErrorCode.RATE_LIMITED));
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            return err(this.createError(TransferErrorCode.SIGNALING_FAILED, 'Session not found'));
        }

        return ok(session.candidates);
    }

    // --------------------------------------------------------------------------
    // Polling with Exponential Backoff
    // --------------------------------------------------------------------------

    /**
     * Start polling for signaling messages
     */
    startPolling(
        sessionId: SessionId,
        onMessage: (message: SignalingMessage) => void,
        isInitiator: boolean
    ): void {
        this.stopPolling();
        this.currentBackoff = SIGNALING_CONFIG.pollingIntervalMs;

        const poll = async () => {
            const session = this.sessions.get(sessionId);
            if (!session) {
                this.stopPolling();
                return;
            }

            try {
                if (isInitiator) {
                    // Initiator waits for answer
                    const answerResult = this.getAnswer(sessionId);
                    if (answerResult.success && answerResult.data) {
                        onMessage({ type: 'ANSWER', payload: answerResult.data });
                        this.resetBackoff();
                    } else {
                        this.increaseBackoff();
                    }
                } else {
                    // Receiver waits for offer
                    const offerResult = this.getOffer(sessionId);
                    if (offerResult.success && offerResult.data) {
                        onMessage({ type: 'OFFER', payload: offerResult.data });
                        this.resetBackoff();
                    } else {
                        this.increaseBackoff();
                    }
                }

                // Always check for new candidates
                const candidatesResult = this.getCandidates(sessionId);
                if (candidatesResult.success) {
                    for (const candidate of candidatesResult.data) {
                        onMessage({ type: 'CANDIDATE', payload: { sessionId, candidate } });
                    }
                }
            } catch (error) {
                console.error('Polling error:', error);
                this.increaseBackoff();
            }

            // Schedule next poll with current backoff
            this.pollingInterval = setTimeout(poll, this.currentBackoff);
        };

        poll();
    }

    /**
     * Stop polling
     */
    stopPolling(): void {
        if (this.pollingInterval) {
            clearTimeout(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.resetBackoff();
    }

    private increaseBackoff(): void {
        this.currentBackoff = Math.min(
            this.currentBackoff * 1.5,
            SIGNALING_CONFIG.maxBackoffMs
        );
    }

    private resetBackoff(): void {
        this.currentBackoff = SIGNALING_CONFIG.pollingIntervalMs;
    }

    // --------------------------------------------------------------------------
    // QR Code Data
    // --------------------------------------------------------------------------

    /**
     * Generate QR code data for session sharing
     */
    generateQRData(sessionId: SessionId, port: number): string {
        // Get local IP (will be populated by device discovery)
        const data = {
            v: 1, // Version
            s: sessionId,
            p: port
        };
        return JSON.stringify(data);
    }

    /**
     * Parse QR code data
     */
    parseQRData(qrData: string): Result<{ sessionId: SessionId; port: number }, TransferError> {
        try {
            const data = JSON.parse(qrData) as { v: number; s: string; p: number };

            if (data.v !== 1) {
                return err(this.createError(TransferErrorCode.SIGNALING_FAILED, 'Unsupported QR version'));
            }

            return ok({
                sessionId: data.s as SessionId,
                port: data.p
            });
        } catch {
            return err(this.createError(TransferErrorCode.SIGNALING_FAILED, 'Invalid QR data'));
        }
    }

    // --------------------------------------------------------------------------
    // Cleanup
    // --------------------------------------------------------------------------

    /**
     * Remove expired sessions
     */
    private cleanupExpiredSessions(): void {
        const now = Date.now();
        const expired: SessionId[] = [];

        for (const [sessionId, session] of this.sessions) {
            if (now - session.lastActivity > SIGNALING_CONFIG.sessionTimeoutMs) {
                expired.push(sessionId);
            }
        }

        for (const sessionId of expired) {
            this.sessions.delete(sessionId);
        }
    }

    /**
     * Cleanup all resources
     */
    cleanup(): void {
        this.stopPolling();
        this.sessions.clear();
    }

    // --------------------------------------------------------------------------
    // Utilities
    // --------------------------------------------------------------------------

    private createError(code: TransferErrorCode, details?: string): TransferError {
        return {
            code,
            message: ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN,
            details,
            timestamp: Date.now(),
            recoverable: code === TransferErrorCode.RATE_LIMITED
        };
    }
}

// Singleton export
export const signalingService = new SignalingService();
export type { SignalingService };
