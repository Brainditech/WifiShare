import express from 'express';
import { createServer as createHttpServer, Server } from 'http';
import { WebSocketServer } from 'ws';
import * as path from 'path';
import * as fs from 'fs';
import { app, BrowserWindow } from 'electron';
import { getLocalIP } from './utils/network';
import { generateSessionCode } from './utils/session';
import { setupWebSocket } from './websocket';

let server: Server | null = null;
let wss: WebSocketServer | null = null;

let serverInfo = {
    ip: '',
    port: 3847,
    sessionCode: '',
    url: '',
};

export async function startServer(): Promise<void> {
    const expressApp = express();

    // Get local IP and generate session code
    serverInfo.ip = getLocalIP();
    serverInfo.sessionCode = generateSessionCode();
    // URL simple sans /s/ - le code est en query parameter
    serverInfo.url = `http://${serverInfo.ip}:${serverInfo.port}/?code=${serverInfo.sessionCode}`;

    // Determine static files path
    let staticPath: string;

    if (app.isPackaged) {
        staticPath = path.join(process.resourcesPath, 'web-client');
    } else {
        staticPath = path.join(__dirname, '..', '..', 'dist');
        if (!fs.existsSync(staticPath)) {
            staticPath = path.join(process.cwd(), 'dist');
        }
    }

    console.log('=== WiFiShare Server ===');
    console.log('IP:', serverInfo.ip);
    console.log('Port:', serverInfo.port);
    console.log('Session Code:', serverInfo.sessionCode);
    console.log('URL:', serverInfo.url);
    console.log('Static Path:', staticPath);
    console.log('Static exists:', fs.existsSync(staticPath));

    // Middleware
    expressApp.use(express.json({ limit: '50mb' }));

    // API routes BEFORE static files
    expressApp.get('/api/info', (req, res) => {
        res.json({
            sessionCode: serverInfo.sessionCode,
            serverName: 'WiFiShare Desktop',
        });
    });

    expressApp.get('/api/download/:fileId', (req, res) => {
        const { fileId } = req.params;
        const sharedFilesPath = path.join(app.getPath('userData'), 'shared-files.json');

        try {
            if (fs.existsSync(sharedFilesPath)) {
                const sharedFiles = JSON.parse(fs.readFileSync(sharedFilesPath, 'utf-8'));
                const fileInfo = sharedFiles[fileId];

                if (fileInfo && fs.existsSync(fileInfo.path)) {
                    res.download(fileInfo.path, fileInfo.name);
                    return;
                }
            }
            res.status(404).send('File not found');
        } catch {
            res.status(500).send('Error reading file');
        }
    });

    // Serve static files
    expressApp.use(express.static(staticPath));

    // SPA fallback - serve index.html for all other routes
    expressApp.get('*', (req, res) => {
        const indexPath = path.join(staticPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.status(404).send('index.html not found at ' + indexPath);
        }
    });

    // Create HTTP server
    server = createHttpServer(expressApp);

    // Setup WebSocket server
    wss = new WebSocketServer({ server });
    setupWebSocket(wss, serverInfo.sessionCode);

    // Start listening
    return new Promise((resolve, reject) => {
        server!.listen(serverInfo.port, '0.0.0.0', () => {
            console.log('Server running at', serverInfo.url);
            resolve();
        });

        server!.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                serverInfo.port++;
                serverInfo.url = `http://${serverInfo.ip}:${serverInfo.port}/?code=${serverInfo.sessionCode}`;
                server!.listen(serverInfo.port, '0.0.0.0');
            } else {
                reject(err);
            }
        });
    });
}

export function stopServer(): void {
    if (wss) {
        wss.close();
        wss = null;
    }
    if (server) {
        server.close();
        server = null;
    }
}

export function getServerInfo() {
    return serverInfo;
}

export function notifyMainWindow(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
        win.webContents.send(channel, data);
    });
}
