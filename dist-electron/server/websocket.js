"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWebSocket = setupWebSocket;
exports.shareFile = shareFile;
exports.getConnectedClients = getConnectedClients;
const ws_1 = require("ws");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const electron_1 = require("electron");
const index_1 = require("./index");
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
const log = (...args) => { if (isDev)
    console.log('[ws]', ...args); };
// Auth rate limiting: max 5 failures per IP per 60 seconds
const authAttempts = new Map();
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_WINDOW_MS = 60_000;
const clients = new Map();
// Files shared by the desktop app for download
const sharedFiles = new Map();
function setupWebSocket(wss, sessionCode) {
    // Server-side heartbeat to detect and clean up dead connections
    // Mobile browsers can be slow to respond — allow 1 missed pong before terminating
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach(ws => {
            const missed = ws.missedPongs ?? 0;
            if (missed >= 2) {
                ws.terminate();
                return;
            }
            ws.missedPongs = missed + 1;
            ws.ping();
        });
    }, 45_000);
    wss.on('close', () => clearInterval(heartbeatInterval));
    wss.on('connection', (ws) => {
        const extWs = ws;
        extWs.missedPongs = 0;
        ws.on('pong', () => { extWs.missedPongs = 0; });
        const clientId = generateClientId();
        const client = { ws, id: clientId, authenticated: false };
        clients.set(clientId, client);
        log(`Client connected: ${clientId}`);
        // Close unauthenticated connections after 30 seconds
        const authTimeout = setTimeout(() => {
            if (!client.authenticated) {
                ws.close();
            }
        }, 30_000);
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await handleMessage(client, message, sessionCode);
            }
            catch (err) {
                console.error('Error handling message:', err);
                sendError(ws, 'Invalid message format');
            }
        });
        ws.on('close', () => {
            clearTimeout(authTimeout);
            clients.delete(clientId);
            (0, index_1.notifyMainWindow)('client-disconnected', { id: clientId });
            log(`Client disconnected: ${clientId}`);
        });
        ws.on('error', (err) => {
            console.error(`WebSocket error for client ${clientId}:`, err);
        });
    });
}
async function handleMessage(client, message, validSessionCode) {
    const { type, sessionCode, payload } = message;
    // Authentication
    if (type === 'auth') {
        const ip = client.ws._socket?.remoteAddress ?? 'unknown';
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
            (0, index_1.notifyMainWindow)('client-connected', { id: client.id });
            const availableFiles = Array.from(sharedFiles.entries()).map(([id, info]) => ({
                id,
                name: info.name,
            }));
            send(client.ws, { type: 'available-files', files: availableFiles });
        }
        else {
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
            handleFileRequest(client, payload);
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
function handleFileRequest(client, payload) {
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
function send(ws, data) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}
function sendError(ws, error) {
    log('Sending error to client:', error);
    send(ws, { type: 'error', message: error });
}
function generateClientId() {
    return (0, crypto_1.randomBytes)(6).toString('hex'); // 12-char hex, 48 bits of entropy
}
// Export for sharing files from desktop
function shareFile(filePath) {
    const fileId = generateClientId();
    const fileName = path.basename(filePath);
    sharedFiles.set(fileId, { name: fileName, path: filePath });
    // Persist shared files
    const sharedFilesPath = path.join(electron_1.app.getPath('userData'), 'shared-files.json');
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
function getConnectedClients() {
    return Array.from(clients.values())
        .filter(c => c.authenticated)
        .map(c => ({ id: c.id }));
}
