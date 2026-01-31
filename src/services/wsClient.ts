// ============================================================================
// WiFiShare - Client WebSocket
// Service de communication temps réel entre appareils
// ============================================================================

type MessageHandler = (message: any) => void;

class WebSocketClient {
    private ws: WebSocket | null = null;
    private handlers: Map<string, MessageHandler[]> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private sessionCode: string | null = null;

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Use same host and port as the page, with /ws path
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;

            console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);

            try {
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log('✅ WebSocket connected');
                    this.reconnectAttempts = 0;
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        console.log('📨 Message received:', message.type);
                        this.emit(message.type, message);
                    } catch (error) {
                        console.error('Failed to parse message:', error);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('🔌 WebSocket disconnected');
                    this.emit('DISCONNECTED', {});
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    // Create a new session (for receiver)
    createSession(): void {
        this.send({ type: 'CREATE_SESSION' });
    }

    // Join an existing session (for sender)
    joinSession(code: string): void {
        this.sessionCode = code;
        this.send({ type: 'JOIN_SESSION', code });
    }

    // Announce files to send
    sendFiles(files: { name: string; size: number; type: string }[]): void {
        this.send({ type: 'SEND_FILES', files });
    }

    // Accept incoming files
    acceptFiles(): void {
        this.send({ type: 'ACCEPT_FILES' });
    }

    // Send a file chunk
    sendChunk(fileIndex: number, chunkIndex: number, totalChunks: number, data: string, fileName: string): void {
        this.send({
            type: 'FILE_CHUNK',
            fileIndex,
            chunkIndex,
            totalChunks,
            data,
            fileName
        });
    }

    // Notify file complete
    fileComplete(fileIndex: number, fileName: string): void {
        this.send({ type: 'FILE_COMPLETE', fileIndex, fileName });
    }

    // Notify transfer complete
    transferComplete(): void {
        this.send({ type: 'TRANSFER_COMPLETE' });
    }

    // Acknowledge chunk received
    acknowledgeChunk(fileIndex: number, chunkIndex: number): void {
        this.send({ type: 'CHUNK_ACK', fileIndex, chunkIndex });
    }

    // Subscribe to messages
    on(type: string, handler: MessageHandler): () => void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }
        this.handlers.get(type)!.push(handler);

        // Return unsubscribe function
        return () => {
            const handlers = this.handlers.get(type);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
            }
        };
    }

    private emit(type: string, message: any): void {
        const handlers = this.handlers.get(type);
        if (handlers) {
            handlers.forEach(handler => handler(message));
        }

        // Also emit to 'all' handlers
        const allHandlers = this.handlers.get('*');
        if (allHandlers) {
            allHandlers.forEach(handler => handler(message));
        }
    }

    private send(message: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected, cannot send:', message.type);
        }
    }
}

// Singleton instance
export const wsClient = new WebSocketClient();
