import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { app } from 'electron';
import { notifyMainWindow } from './index';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const log = (...args: unknown[]) => { if (isDev) console.log('[ws]', ...args); };

// Auth rate limiting: max 5 failures per IP per 60 seconds
const authAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_WINDOW_MS = 60_000;

interface Client {
    ws: WebSocket;
    id: string;
    authenticated: boolean;
}

interface Message {
    type: string;
    sessionCode?: string;
    payload?: unknown;
}

const clients: Map<string, Client> = new Map();

// Files shared by the desktop app for download
const sharedFiles: Map<string, { name: string; path: string }> = new Map();

export function setupWebSocket(wss: WebSocketServer, sessionCode: string): void {
    // Server-side heartbeat to detect and clean up dead connections
    // Mobile browsers can be slow to respond — allow 1 missed pong before terminating
    const heartbeatInterval = setInterval(() => {
        (wss.clients as Set<WebSocket & { missedPongs?: number }>).forEach(ws => {
            const missed = ws.missedPongs ?? 0;
            if (missed >= 2) { ws.terminate(); return; }
            ws.missedPongs = missed + 1;
            ws.ping();
        });
    }, 45_000);
    wss.on('close', () => clearInterval(heartbeatInterval));

    wss.on('connection', (ws: WebSocket) => {
        const extWs = ws as WebSocket & { missedPongs?: number };
        extWs.missedPongs = 0;
        ws.on('pong', () => { extWs.missedPongs = 0; });

        const clientId = generateClientId();
        const client: Client = { ws, id: clientId, authenticated: false };
        clients.set(clientId, client);

        log(`Client connected: ${clientId}`);

        // Close unauthenticated connections after 30 seconds
        const authTimeout = setTimeout(() => {
            if (!client.authenticated) {
                ws.close();
            }
        }, 30_000);

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
            clearTimeout(authTimeout);
            clients.delete(clientId);
            notifyMainWindow('client-disconnected', { id: clientId });
            log(`Client disconnected: ${clientId}`);
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
        const ip = (client.ws as WebSocket & { _socket?: { remoteAddress?: string } })._socket?.remoteAddress ?? 'unknown';
        const now = Date.now();
        const attempts = authAttempts.get(ip);

        if (attempts && now - attempts.firstAttempt < AUTH_WINDOW_MS && attempts.count >= MAX_AUTH_ATTEMPTS) {
            log(`Auth rate-limited for IP ${ip} (${attempts.count} failures)`);
            send(client.ws, { type: 'auth-failed', reason: 'Too many attempts' });
            client.ws.close();
            return;
        }

        if (sessionCode === validSessionCode) {
            authAttempts.delete(ip);
            client.authenticated = true;
            log(`Auth SUCCESS for client ${client.id} (IP ${ip})`);
            send(client.ws, { type: 'auth-success', clientId: client.id });
            notifyMainWindow('client-connected', { id: client.id });

            const availableFiles = Array.from(sharedFiles.entries()).map(([id, info]) => ({
                id,
                name: info.name,
            }));
            send(client.ws, { type: 'available-files', files: availableFiles });
        } else {
            const resetTime = attempts && now - attempts.firstAttempt < AUTH_WINDOW_MS ? attempts.firstAttempt : now;
            authAttempts.set(ip, { count: (attempts?.count ?? 0) + 1, firstAttempt: resetTime });
            log(`Auth FAILED for client ${client.id} (got "${sessionCode}", expected "${validSessionCode}")`);
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
        case 'file-request':
            handleFileRequest(client, payload as { fileId: string });
            break;

        case 'ping':
            send(client.ws, { type: 'pong' });
            break;

        default:
            // Uploads now go through POST /api/upload — silently ignore stale
            // file-start/chunk/end/cancel messages from older clients.
            log(`Unknown message type: ${type}`);
    }
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
    log('Sending error to client:', error);
    send(ws, { type: 'error', message: error });
}

function generateClientId(): string {
    return randomBytes(6).toString('hex'); // 12-char hex, 48 bits of entropy
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
