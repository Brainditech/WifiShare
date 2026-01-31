import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { notifyMainWindow } from './index';

interface Client {
    ws: WebSocket;
    id: string;
    authenticated: boolean;
}

interface FileChunk {
    type: 'file-start' | 'file-chunk' | 'file-end' | 'file-request';
    fileId: string;
    fileName?: string;
    fileSize?: number;
    chunkIndex?: number;
    totalChunks?: number;
    data?: string; // Base64 encoded
}

interface Message {
    type: string;
    sessionCode?: string;
    payload?: unknown;
}

const clients: Map<string, Client> = new Map();
const pendingFiles: Map<string, {
    name: string;
    size: number;
    chunks: Buffer[];
    receivedChunks: number;
    totalChunks: number;
}> = new Map();

// Files shared by the desktop app for download
const sharedFiles: Map<string, { name: string; path: string }> = new Map();

export function setupWebSocket(wss: WebSocketServer, sessionCode: string): void {
    wss.on('connection', (ws: WebSocket) => {
        const clientId = generateClientId();
        const client: Client = { ws, id: clientId, authenticated: false };
        clients.set(clientId, client);

        console.log(`Client connected: ${clientId}`);

        ws.on('message', async (data: Buffer) => {
            try {
                const message: Message = JSON.parse(data.toString());
                await handleMessage(client, message, sessionCode);
            } catch (err) {
                console.error('Error handling message:', err);
                sendError(ws, 'Invalid message format');
            }
        });

        ws.on('close', () => {
            clients.delete(clientId);
            notifyMainWindow('client-disconnected', { id: clientId });
            console.log(`Client disconnected: ${clientId}`);
        });

        ws.on('error', (err) => {
            console.error(`WebSocket error for client ${clientId}:`, err);
        });
    });
}

async function handleMessage(client: Client, message: Message, validSessionCode: string): Promise<void> {
    const { type, sessionCode, payload } = message;

    // Authentication
    if (type === 'auth') {
        if (sessionCode === validSessionCode) {
            client.authenticated = true;
            send(client.ws, { type: 'auth-success', clientId: client.id });
            notifyMainWindow('client-connected', { id: client.id });

            // Send list of available files for download
            const availableFiles = Array.from(sharedFiles.entries()).map(([id, info]) => ({
                id,
                name: info.name,
            }));
            send(client.ws, { type: 'available-files', files: availableFiles });
        } else {
            send(client.ws, { type: 'auth-failed', reason: 'Invalid session code' });
            client.ws.close();
        }
        return;
    }

    // All other messages require authentication
    if (!client.authenticated) {
        sendError(client.ws, 'Not authenticated');
        return;
    }

    switch (type) {
        case 'file-start':
            handleFileStart(client, payload as FileChunk);
            break;

        case 'file-chunk':
            handleFileChunk(client, payload as FileChunk);
            break;

        case 'file-end':
            await handleFileEnd(client, payload as FileChunk);
            break;

        case 'file-request':
            handleFileRequest(client, payload as { fileId: string });
            break;

        case 'ping':
            send(client.ws, { type: 'pong' });
            break;

        default:
            console.log(`Unknown message type: ${type}`);
    }
}

function handleFileStart(client: Client, payload: FileChunk): void {
    const { fileId, fileName, fileSize, totalChunks } = payload;

    if (!fileId || !fileName || !fileSize || !totalChunks) {
        sendError(client.ws, 'Invalid file-start payload');
        return;
    }

    pendingFiles.set(fileId, {
        name: fileName,
        size: fileSize,
        chunks: new Array(totalChunks),
        receivedChunks: 0,
        totalChunks,
    });

    send(client.ws, { type: 'file-start-ack', fileId });
    console.log(`Started receiving file: ${fileName} (${formatBytes(fileSize)})`);
}

function handleFileChunk(client: Client, payload: FileChunk): void {
    const { fileId, chunkIndex, data } = payload;

    if (fileId === undefined || chunkIndex === undefined || !data) {
        sendError(client.ws, 'Invalid file-chunk payload');
        return;
    }

    const pending = pendingFiles.get(fileId);
    if (!pending) {
        sendError(client.ws, 'Unknown file ID');
        return;
    }

    // Decode base64 chunk
    const buffer = Buffer.from(data, 'base64');
    pending.chunks[chunkIndex] = buffer;
    pending.receivedChunks++;

    // Calculate and report progress
    const percent = Math.round((pending.receivedChunks / pending.totalChunks) * 100);
    notifyMainWindow('transfer-progress', { fileName: pending.name, percent });

    send(client.ws, { type: 'file-chunk-ack', fileId, chunkIndex });
}

async function handleFileEnd(client: Client, payload: FileChunk): Promise<void> {
    const { fileId } = payload;

    const pending = pendingFiles.get(fileId);
    if (!pending) {
        sendError(client.ws, 'Unknown file ID');
        return;
    }

    // Combine all chunks
    const fileBuffer = Buffer.concat(pending.chunks.filter(Boolean));

    // Save to downloads folder
    const downloadsPath = app.getPath('downloads');
    const wifiShareFolder = path.join(downloadsPath, 'WiFiShare');

    if (!fs.existsSync(wifiShareFolder)) {
        fs.mkdirSync(wifiShareFolder, { recursive: true });
    }

    // Handle filename conflicts
    let fileName = pending.name;
    let filePath = path.join(wifiShareFolder, fileName);
    let counter = 1;

    while (fs.existsSync(filePath)) {
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        fileName = `${base} (${counter})${ext}`;
        filePath = path.join(wifiShareFolder, fileName);
        counter++;
    }

    fs.writeFileSync(filePath, fileBuffer);

    pendingFiles.delete(fileId);

    send(client.ws, { type: 'file-complete', fileId, savedAs: fileName });
    notifyMainWindow('file-received', { name: fileName, path: filePath });

    console.log(`File saved: ${filePath}`);
}

function handleFileRequest(client: Client, payload: { fileId: string }): void {
    const { fileId } = payload;
    const fileInfo = sharedFiles.get(fileId);

    if (!fileInfo || !fs.existsSync(fileInfo.path)) {
        sendError(client.ws, 'File not found');
        return;
    }

    // Send file info - client will download via HTTP
    send(client.ws, {
        type: 'file-ready',
        fileId,
        fileName: fileInfo.name,
        downloadUrl: `/api/download/${fileId}`,
    });
}

// Utility functions
function send(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function sendError(ws: WebSocket, error: string): void {
    send(ws, { type: 'error', message: error });
}

function generateClientId(): string {
    return Math.random().toString(36).substring(2, 10);
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Export for sharing files from desktop
export function shareFile(filePath: string): string {
    const fileId = generateClientId();
    const fileName = path.basename(filePath);

    sharedFiles.set(fileId, { name: fileName, path: filePath });

    // Persist shared files
    const sharedFilesPath = path.join(app.getPath('userData'), 'shared-files.json');
    const data = Object.fromEntries(sharedFiles);
    fs.writeFileSync(sharedFilesPath, JSON.stringify(data));

    // Notify all connected clients
    const availableFiles = Array.from(sharedFiles.entries()).map(([id, info]) => ({
        id,
        name: info.name,
    }));

    clients.forEach(client => {
        if (client.authenticated) {
            send(client.ws, { type: 'available-files', files: availableFiles });
        }
    });

    return fileId;
}

export function getConnectedClients(): { id: string }[] {
    return Array.from(clients.values())
        .filter(c => c.authenticated)
        .map(c => ({ id: c.id }));
}
