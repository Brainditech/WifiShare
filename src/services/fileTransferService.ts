// ============================================================================
// WiFiShare - Service de Transfert de Fichiers Sécurisé
// Chunking, checksum SHA-256, validation et progress tracking
// ============================================================================

import {
    type FileMetadata,
    type TransferProgress,
    type TransferId,
    type Result,
    type TransferError,
    type ChunkData,
    type ChunkAck,
    TransferErrorCode,
    createTransferId,
    ok,
    err
} from '../types';
import { FILE_VALIDATION_CONFIG, TRANSFER_CONFIG, ERROR_MESSAGES } from '../config';

// ============================================================================
// Types internes
// ============================================================================

interface ChunkInfo {
    index: number;
    start: number;
    end: number;
    size: number;
}

interface TransferContext {
    transferId: TransferId;
    file: File;
    metadata: FileMetadata;
    chunks: ChunkInfo[];
    currentChunk: number;
    transferredBytes: number;
    startTime: number;
    checksum: string;
    retryCount: Map<number, number>;
}

// ProgressCallback type removed - will be used when implementing actual progress callbacks

// ============================================================================
// File Transfer Service Class
// ============================================================================

class FileTransferService {
    private activeTransfers: Map<TransferId, TransferContext> = new Map();
    private receivingBuffers: Map<TransferId, ArrayBuffer[]> = new Map();

    // --------------------------------------------------------------------------
    // File Validation (Sécurité)
    // --------------------------------------------------------------------------

    /**
     * Validate a file before transfer
     */
    validateFile(file: File): Result<FileMetadata, TransferError> {
        // Check file size
        if (file.size > FILE_VALIDATION_CONFIG.maxSizeBytes) {
            return err(this.createError(
                TransferErrorCode.FILE_TOO_LARGE,
                `File size: ${this.formatBytes(file.size)}, Max: ${this.formatBytes(FILE_VALIDATION_CONFIG.maxSizeBytes)}`
            ));
        }

        // Check MIME type
        const mimeType = file.type || 'application/octet-stream';
        if (!this.isAllowedMimeType(mimeType)) {
            return err(this.createError(
                TransferErrorCode.INVALID_FILE_TYPE,
                `MIME type: ${mimeType}`
            ));
        }

        // Sanitize filename (security)
        const sanitizedName = this.sanitizeFileName(file.name);

        const metadata: FileMetadata = {
            name: sanitizedName,
            size: file.size,
            type: mimeType,
            lastModified: file.lastModified
        };

        return ok(metadata);
    }

    /**
     * Check if MIME type is allowed
     */
    private isAllowedMimeType(mimeType: string): boolean {
        // Allow all types if application/octet-stream is in the list
        if (FILE_VALIDATION_CONFIG.allowedMimeTypes.includes('application/octet-stream')) {
            return true;
        }

        // Check exact match
        if (FILE_VALIDATION_CONFIG.allowedMimeTypes.includes(mimeType)) {
            return true;
        }

        // Check wildcard patterns (e.g., image/*)
        const [type] = mimeType.split('/');
        return FILE_VALIDATION_CONFIG.allowedMimeTypes.some(
            allowed => allowed === `${type}/*`
        );
    }

    /**
     * Sanitize filename to prevent path traversal and other attacks
     */
    private sanitizeFileName(name: string): string {
        if (!FILE_VALIDATION_CONFIG.sanitizeFileName) {
            return name;
        }

        // Remove path separators and null bytes
        let sanitized = name
            .replace(/\\/g, '')
            .replace(/\//g, '')
            .replace(/\0/g, '')
            .replace(/\.\./g, '');

        // Remove leading dots (hidden files on Unix)
        sanitized = sanitized.replace(/^\.+/, '');

        // Limit length
        if (sanitized.length > 255) {
            const ext = this.getFileExtension(sanitized);
            const baseName = sanitized.slice(0, 250 - ext.length);
            sanitized = baseName + ext;
        }

        // Fallback for empty names
        if (!sanitized) {
            sanitized = `file_${Date.now()}`;
        }

        return sanitized;
    }

    private getFileExtension(filename: string): string {
        const lastDot = filename.lastIndexOf('.');
        return lastDot > 0 ? filename.slice(lastDot) : '';
    }

    // --------------------------------------------------------------------------
    // Checksum (SHA-256 via Web Crypto API)
    // --------------------------------------------------------------------------

    /**
     * Compute SHA-256 checksum of data using Web Crypto API (secure)
     */
    async computeChecksum(data: ArrayBuffer): Promise<string> {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Compute checksum for a chunk
     */
    async computeChunkChecksum(chunk: ArrayBuffer): Promise<string> {
        return this.computeChecksum(chunk);
    }

    // --------------------------------------------------------------------------
    // Chunking
    // --------------------------------------------------------------------------

    /**
     * Prepare a file for transfer (create chunks info)
     */
    async prepareTransfer(file: File): Promise<Result<TransferId, TransferError>> {
        const validation = this.validateFile(file);
        if (!validation.success) {
            return err(validation.error);
        }

        const transferId = createTransferId();
        const chunkSize = TRANSFER_CONFIG.chunkSizeBytes;
        const totalChunks = Math.ceil(file.size / chunkSize);

        const chunks: ChunkInfo[] = [];
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            chunks.push({
                index: i,
                start,
                end,
                size: end - start
            });
        }

        // Compute full file checksum
        const fileBuffer = await file.arrayBuffer();
        const checksum = await this.computeChecksum(fileBuffer);

        const context: TransferContext = {
            transferId,
            file,
            metadata: { ...validation.data, checksum },
            chunks,
            currentChunk: 0,
            transferredBytes: 0,
            startTime: Date.now(),
            checksum,
            retryCount: new Map()
        };

        this.activeTransfers.set(transferId, context);

        return ok(transferId);
    }

    /**
     * Get the next chunk to send
     */
    async getNextChunk(transferId: TransferId): Promise<Result<ChunkData | null, TransferError>> {
        const context = this.activeTransfers.get(transferId);
        if (!context) {
            return err(this.createError(TransferErrorCode.UNKNOWN, 'Transfer not found'));
        }

        if (context.currentChunk >= context.chunks.length) {
            return ok(null); // Transfer complete
        }

        const chunkInfo = context.chunks[context.currentChunk];
        const chunk = context.file.slice(chunkInfo.start, chunkInfo.end);
        const buffer = await chunk.arrayBuffer();
        const checksum = await this.computeChunkChecksum(buffer);

        const chunkData: ChunkData = {
            index: chunkInfo.index,
            data: buffer,
            checksum,
            isLast: context.currentChunk === context.chunks.length - 1
        };

        return ok(chunkData);
    }

    /**
     * Acknowledge a chunk (move to next)
     */
    acknowledgeChunk(transferId: TransferId, ack: ChunkAck): Result<void, TransferError> {
        const context = this.activeTransfers.get(transferId);
        if (!context) {
            return err(this.createError(TransferErrorCode.UNKNOWN, 'Transfer not found'));
        }

        if (!ack.success) {
            // Retry logic
            const retries = context.retryCount.get(ack.index) ?? 0;
            if (retries >= TRANSFER_CONFIG.maxRetries) {
                return err(this.createError(
                    TransferErrorCode.CHECKSUM_MISMATCH,
                    `Chunk ${ack.index} failed after ${retries} retries`
                ));
            }
            context.retryCount.set(ack.index, retries + 1);
            // Don't advance, resend same chunk
            return ok(undefined);
        }

        // Advance to next chunk
        const chunkInfo = context.chunks[context.currentChunk];
        context.transferredBytes += chunkInfo.size;
        context.currentChunk++;
        context.retryCount.delete(ack.index);

        return ok(undefined);
    }

    /**
     * Get transfer progress
     */
    getProgress(transferId: TransferId): TransferProgress | null {
        const context = this.activeTransfers.get(transferId);
        if (!context) {
            return null;
        }

        const elapsed = Date.now() - context.startTime;
        const speed = elapsed > 0 ? (context.transferredBytes / elapsed) * 1000 : 0;
        const remaining = context.metadata.size - context.transferredBytes;
        const estimatedTime = speed > 0 ? (remaining / speed) * 1000 : 0;

        return {
            transferId,
            fileName: context.metadata.name,
            totalBytes: context.metadata.size,
            transferredBytes: context.transferredBytes,
            percentage: (context.transferredBytes / context.metadata.size) * 100,
            speed,
            estimatedTimeRemaining: estimatedTime,
            currentChunk: context.currentChunk,
            totalChunks: context.chunks.length
        };
    }

    /**
     * Get file metadata for transfer
     */
    getMetadata(transferId: TransferId): FileMetadata | null {
        return this.activeTransfers.get(transferId)?.metadata ?? null;
    }

    /**
     * Get final checksum
     */
    getFinalChecksum(transferId: TransferId): string | null {
        return this.activeTransfers.get(transferId)?.checksum ?? null;
    }

    // --------------------------------------------------------------------------
    // Receiving
    // --------------------------------------------------------------------------

    /**
     * Start receiving a file
     */
    startReceiving(transferId: TransferId, _metadata: FileMetadata): void {
        this.receivingBuffers.set(transferId, []);
    }

    /**
     * Receive a chunk and validate
     */
    async receiveChunk(transferId: TransferId, chunk: ChunkData): Promise<ChunkAck> {
        const buffer = this.receivingBuffers.get(transferId);
        if (!buffer) {
            return { index: chunk.index, checksum: '', success: false };
        }

        // Verify checksum
        const computedChecksum = await this.computeChunkChecksum(chunk.data);
        const success = computedChecksum === chunk.checksum;

        if (success) {
            buffer[chunk.index] = chunk.data;
        }

        return {
            index: chunk.index,
            checksum: computedChecksum,
            success
        };
    }

    /**
     * Complete receiving and create file
     */
    async completeReceiving(
        transferId: TransferId,
        metadata: FileMetadata,
        expectedChecksum: string
    ): Promise<Result<Blob, TransferError>> {
        const chunks = this.receivingBuffers.get(transferId);
        if (!chunks) {
            return err(this.createError(TransferErrorCode.UNKNOWN, 'No receiving buffer found'));
        }

        // Combine all chunks
        const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const combined = new Uint8Array(totalSize);
        let offset = 0;

        for (const chunk of chunks) {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }

        // Verify final checksum
        const finalChecksum = await this.computeChecksum(combined.buffer);
        if (finalChecksum !== expectedChecksum) {
            this.receivingBuffers.delete(transferId);
            return err(this.createError(
                TransferErrorCode.CHECKSUM_MISMATCH,
                `Expected: ${expectedChecksum.slice(0, 16)}..., Got: ${finalChecksum.slice(0, 16)}...`
            ));
        }

        // Create blob
        const blob = new Blob([combined], { type: metadata.type });
        this.receivingBuffers.delete(transferId);

        return ok(blob);
    }

    // --------------------------------------------------------------------------
    // Cleanup
    // --------------------------------------------------------------------------

    /**
     * Cancel and cleanup a transfer
     */
    cancelTransfer(transferId: TransferId): void {
        this.activeTransfers.delete(transferId);
        this.receivingBuffers.delete(transferId);
    }

    /**
     * Cleanup all transfers
     */
    cleanup(): void {
        this.activeTransfers.clear();
        this.receivingBuffers.clear();
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
            recoverable: code !== TransferErrorCode.FILE_TOO_LARGE &&
                code !== TransferErrorCode.INVALID_FILE_TYPE &&
                code !== TransferErrorCode.CHECKSUM_MISMATCH
        };
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }
}

// Singleton export
export const fileTransferService = new FileTransferService();
export type { FileTransferService };
