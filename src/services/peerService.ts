// ============================================================================
// WiFiShare - Service PeerJS
// Connexion P2P fiable avec PeerJS
// ============================================================================

import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

// Types pour les messages
interface FileInfo {
    name: string;
    size: number;
    type: string;
}

interface FileChunk {
    type: 'chunk';
    fileIndex: number;
    chunkIndex: number;
    totalChunks: number;
    data: ArrayBuffer;
}

interface FileStart {
    type: 'file-start';
    fileIndex: number;
    fileName: string;
    fileSize: number;
    fileType: string;
    totalChunks: number;
}

interface FileEnd {
    type: 'file-end';
    fileIndex: number;
    fileName: string;
}

interface TransferStart {
    type: 'transfer-start';
    files: FileInfo[];
}

interface TransferEnd {
    type: 'transfer-end';
    totalFiles: number;
}

type PeerMessage = FileChunk | FileStart | FileEnd | TransferStart | TransferEnd;

// Callbacks
type OnConnectedCallback = () => void;
type OnDisconnectedCallback = () => void;
type OnFilesIncomingCallback = (files: FileInfo[]) => void;
type OnFileStartCallback = (fileIndex: number, fileName: string, fileSize: number) => void;
type OnProgressCallback = (fileIndex: number, progress: number) => void;
type OnFileCompleteCallback = (fileIndex: number, fileName: string, blob: Blob) => void;
type OnTransferCompleteCallback = () => void;
type OnErrorCallback = (error: string) => void;

const CHUNK_SIZE = 16 * 1024; // 16KB chunks - smaller for reliability

class PeerService {
    private peer: Peer | null = null;
    private connection: DataConnection | null = null;
    private myPeerId: string = '';

    // Callbacks
    private onConnected: OnConnectedCallback | null = null;
    private onDisconnected: OnDisconnectedCallback | null = null;
    private onFilesIncoming: OnFilesIncomingCallback | null = null;
    private onFileStart: OnFileStartCallback | null = null;
    private onProgress: OnProgressCallback | null = null;
    private onFileComplete: OnFileCompleteCallback | null = null;
    private onTransferComplete: OnTransferCompleteCallback | null = null;
    private onError: OnErrorCallback | null = null;

    // File receiving state
    private receivingFiles: Map<number, {
        chunks: ArrayBuffer[];
        fileName: string;
        fileType: string;
        totalChunks: number;
        receivedChunks: number;
    }> = new Map();

    // Generate a short 6-character ID
    private generateShortId(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let id = '';
        for (let i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    // Initialize peer and wait for connection to PeerJS server
    async initialize(): Promise<string> {
        return new Promise((resolve, reject) => {
            const peerId = this.generateShortId();

            // Use the free PeerJS cloud server
            this.peer = new Peer(peerId, {
                debug: 2, // Show warnings
            });

            this.peer.on('open', (id) => {
                console.log('✅ Connected to PeerJS server with ID:', id);
                this.myPeerId = id;
                resolve(id);
            });

            this.peer.on('error', (err) => {
                console.error('❌ PeerJS error:', err);
                if (err.type === 'unavailable-id') {
                    // ID already taken, try again with a new one
                    this.destroy();
                    this.initialize().then(resolve).catch(reject);
                } else {
                    this.onError?.(err.message || 'Erreur de connexion');
                    reject(err);
                }
            });

            this.peer.on('disconnected', () => {
                console.log('🔌 Disconnected from PeerJS server');
                // Try to reconnect
                this.peer?.reconnect();
            });

            // Handle incoming connections (for receiver)
            this.peer.on('connection', (conn) => {
                console.log('📲 Incoming connection from:', conn.peer);
                this.setupConnection(conn);
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                if (!this.myPeerId) {
                    reject(new Error('Timeout connecting to PeerJS server'));
                }
            }, 10000);
        });
    }

    // Connect to a remote peer (for sender)
    async connectTo(remotePeerId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.peer) {
                reject(new Error('Peer not initialized'));
                return;
            }

            console.log('🔗 Connecting to peer:', remotePeerId);

            const conn = this.peer.connect(remotePeerId, {
                reliable: true,
                serialization: 'binary'
            });

            conn.on('open', () => {
                console.log('✅ Connected to peer:', remotePeerId);
                this.setupConnection(conn);
                resolve();
            });

            conn.on('error', (err) => {
                console.error('❌ Connection error:', err);
                reject(err);
            });

            // Timeout
            setTimeout(() => {
                if (!this.connection) {
                    reject(new Error('Timeout connecting to peer'));
                }
            }, 10000);
        });
    }

    private setupConnection(conn: DataConnection) {
        this.connection = conn;

        conn.on('open', () => {
            console.log('📡 Data channel open');
            this.onConnected?.();
        });

        conn.on('data', (data) => {
            this.handleMessage(data as PeerMessage);
        });

        conn.on('close', () => {
            console.log('🔌 Connection closed');
            this.connection = null;
            this.onDisconnected?.();
        });

        conn.on('error', (err) => {
            console.error('❌ Connection error:', err);
            this.onError?.(err.message || 'Erreur de connexion');
        });

        // If connection is already open, fire callback
        if (conn.open) {
            this.onConnected?.();
        }
    }

    private handleMessage(message: PeerMessage) {
        switch (message.type) {
            case 'transfer-start':
                console.log('📦 Transfer starting:', message.files.length, 'files');
                this.receivingFiles.clear();
                this.onFilesIncoming?.(message.files);
                break;

            case 'file-start':
                console.log('📄 File starting:', message.fileName);
                this.receivingFiles.set(message.fileIndex, {
                    chunks: new Array(message.totalChunks),
                    fileName: message.fileName,
                    fileType: message.fileType,
                    totalChunks: message.totalChunks,
                    receivedChunks: 0
                });
                this.onFileStart?.(message.fileIndex, message.fileName, message.fileSize);
                break;

            case 'chunk':
                const fileState = this.receivingFiles.get(message.fileIndex);
                if (fileState) {
                    fileState.chunks[message.chunkIndex] = message.data;
                    fileState.receivedChunks++;

                    const progress = (fileState.receivedChunks / fileState.totalChunks) * 100;
                    this.onProgress?.(message.fileIndex, progress);
                }
                break;

            case 'file-end':
                console.log('✅ File complete:', message.fileName);
                const file = this.receivingFiles.get(message.fileIndex);
                if (file) {
                    // Combine chunks into a blob
                    const blob = new Blob(file.chunks, { type: file.fileType });
                    this.onFileComplete?.(message.fileIndex, message.fileName, blob);
                }
                break;

            case 'transfer-end':
                console.log('🎉 Transfer complete:', message.totalFiles, 'files');
                this.onTransferComplete?.();
                break;
        }
    }

    // Send files to the connected peer
    async sendFiles(files: File[], onProgress: (fileIndex: number, progress: number) => void): Promise<void> {
        if (!this.connection || !this.connection.open) {
            throw new Error('Not connected to peer');
        }

        // Announce files
        const fileInfos: FileInfo[] = files.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type || 'application/octet-stream'
        }));

        this.connection.send({ type: 'transfer-start', files: fileInfos } as TransferStart);

        // Send each file
        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
            const file = files[fileIndex];
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);

            // Announce file start
            this.connection.send({
                type: 'file-start',
                fileIndex,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type || 'application/octet-stream',
                totalChunks
            } as FileStart);

            // Send chunks
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, bytes.length);
                const chunk = bytes.slice(start, end).buffer;

                this.connection.send({
                    type: 'chunk',
                    fileIndex,
                    chunkIndex,
                    totalChunks,
                    data: chunk
                } as FileChunk);

                // Update progress
                const progress = ((chunkIndex + 1) / totalChunks) * 100;
                onProgress(fileIndex, progress);

                // Small delay to not overwhelm the connection
                if (chunkIndex % 10 === 0) {
                    await new Promise(r => setTimeout(r, 1));
                }
            }

            // Announce file end
            this.connection.send({
                type: 'file-end',
                fileIndex,
                fileName: file.name
            } as FileEnd);
        }

        // Announce transfer complete
        this.connection.send({
            type: 'transfer-end',
            totalFiles: files.length
        } as TransferEnd);
    }

    // Set callbacks
    setOnConnected(cb: OnConnectedCallback) { this.onConnected = cb; }
    setOnDisconnected(cb: OnDisconnectedCallback) { this.onDisconnected = cb; }
    setOnFilesIncoming(cb: OnFilesIncomingCallback) { this.onFilesIncoming = cb; }
    setOnFileStart(cb: OnFileStartCallback) { this.onFileStart = cb; }
    setOnProgress(cb: OnProgressCallback) { this.onProgress = cb; }
    setOnFileComplete(cb: OnFileCompleteCallback) { this.onFileComplete = cb; }
    setOnTransferComplete(cb: OnTransferCompleteCallback) { this.onTransferComplete = cb; }
    setOnError(cb: OnErrorCallback) { this.onError = cb; }

    // Get current peer ID
    getPeerId(): string {
        return this.myPeerId;
    }

    // Check if connected
    isConnected(): boolean {
        return this.connection !== null && this.connection.open;
    }

    // Destroy the peer
    destroy() {
        this.connection?.close();
        this.peer?.destroy();
        this.peer = null;
        this.connection = null;
        this.myPeerId = '';
        this.receivingFiles.clear();
    }
}

// Singleton
export const peerService = new PeerService();
