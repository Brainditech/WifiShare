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
const electron_1 = require("electron");
const index_1 = require("./index");
const clients = new Map();
const pendingFiles = new Map();
// Files shared by the desktop app for download
const sharedFiles = new Map();
function setupWebSocket(wss, sessionCode) {
    wss.on('connection', (ws) => {
        const clientId = generateClientId();
        const client = { ws, id: clientId, authenticated: false };
        clients.set(clientId, client);
        console.log(`Client connected: ${clientId}`);
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
            clients.delete(clientId);
            (0, index_1.notifyMainWindow)('client-disconnected', { id: clientId });
            console.log(`Client disconnected: ${clientId}`);
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
        if (sessionCode === validSessionCode) {
            client.authenticated = true;
            send(client.ws, { type: 'auth-success', clientId: client.id });
            (0, index_1.notifyMainWindow)('client-connected', { id: client.id });
            // Send list of available files for download
            const availableFiles = Array.from(sharedFiles.entries()).map(([id, info]) => ({
                id,
                name: info.name,
            }));
            send(client.ws, { type: 'available-files', files: availableFiles });
        }
        else {
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
            handleFileStart(client, payload);
            break;
        case 'file-chunk':
            handleFileChunk(client, payload);
            break;
        case 'file-end':
            await handleFileEnd(client, payload);
            break;
        case 'file-request':
            handleFileRequest(client, payload);
            break;
        case 'ping':
            send(client.ws, { type: 'pong' });
            break;
        default:
            console.log(`Unknown message type: ${type}`);
    }
}
function handleFileStart(client, payload) {
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
function handleFileChunk(client, payload) {
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
    (0, index_1.notifyMainWindow)('transfer-progress', { fileName: pending.name, percent });
    send(client.ws, { type: 'file-chunk-ack', fileId, chunkIndex });
}
async function handleFileEnd(client, payload) {
    const { fileId } = payload;
    const pending = pendingFiles.get(fileId);
    if (!pending) {
        sendError(client.ws, 'Unknown file ID');
        return;
    }
    // Combine all chunks
    const fileBuffer = Buffer.concat(pending.chunks.filter(Boolean));
    // Save to downloads folder
    const downloadsPath = electron_1.app.getPath('downloads');
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
    (0, index_1.notifyMainWindow)('file-received', { name: fileName, path: filePath });
    console.log(`File saved: ${filePath}`);
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
    send(ws, { type: 'error', message: error });
}
function generateClientId() {
    return Math.random().toString(36).substring(2, 10);
}
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
