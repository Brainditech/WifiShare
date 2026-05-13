import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createHttpServer, Server, request as httpRequest } from 'http';
import { WebSocketServer } from 'ws';
import * as path from 'path';
import * as fs from 'fs';
import { app, BrowserWindow } from 'electron';
import { getLocalIP } from './utils/network';
import { generateSessionCode } from './utils/session';
import { setupWebSocket } from './websocket';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB hard cap per file

let server: Server | null = null;
let wss: WebSocketServer | null = null;

const serverInfo = {
    ip: '',
    port: 3847,
    sessionCode: '',
    url: '',
};

export async function startServer(): Promise<void> {
    const expressApp = express();

    // Get local IP and generate session code
    serverInfo.ip = await getLocalIP();
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

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (isDev) {
        console.log('=== WiFiShare Server ===');
        console.log('IP:', serverInfo.ip);
        console.log('Port:', serverInfo.port);
        console.log('Session Code:', serverInfo.sessionCode);
        console.log('URL:', serverInfo.url);
        console.log('Static Path:', staticPath);
        console.log('Static exists:', fs.existsSync(staticPath));
    }

    // Middleware
    expressApp.use(express.json({ limit: '50mb' }));

    // API routes BEFORE static files
    expressApp.get('/api/info', (_req, res) => {
        res.json({ serverName: 'WiFiShare Desktop' });
    });

    // POST /api/upload — robust HTTP upload from web client.
    // Replaces the WS chunked transfer: the browser streams the file natively,
    // which survives backgrounding, mobile file pickers, and slow networks.
    // Auth: X-Session-Code header (same code as WS auth).
    // Filename: X-Filename header (URL-encoded). Size cap: MAX_UPLOAD_BYTES.
    expressApp.post('/api/upload', (req: Request, res: Response) => {
        const providedCode = req.headers['x-session-code'];
        if (typeof providedCode !== 'string' || providedCode !== serverInfo.sessionCode) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const rawHeader = req.headers['x-filename'];
        let rawName: string;
        try {
            rawName = decodeURIComponent(typeof rawHeader === 'string' ? rawHeader : '');
        } catch {
            res.status(400).json({ error: 'Invalid X-Filename encoding' });
            return;
        }
        const safeName = path.basename(rawName).replace(/[/\\:*?"<>|]/g, '_').trim();
        if (!safeName || safeName.startsWith('.')) {
            res.status(400).json({ error: 'Invalid file name' });
            return;
        }

        const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
        if (contentLength > MAX_UPLOAD_BYTES) {
            res.status(413).json({ error: `File too large (max ${MAX_UPLOAD_BYTES} bytes)` });
            return;
        }

        const wifiShareFolder = path.join(app.getPath('downloads'), 'WiFiShare');
        if (!fs.existsSync(wifiShareFolder)) fs.mkdirSync(wifiShareFolder, { recursive: true });

        // Resolve a unique target path (avoid clobbering)
        let savedName = safeName;
        let filePath = path.join(wifiShareFolder, savedName);
        let counter = 1;
        while (fs.existsSync(filePath)) {
            const ext = path.extname(safeName);
            const base = path.basename(safeName, ext);
            savedName = `${base} (${counter})${ext}`;
            filePath = path.join(wifiShareFolder, savedName);
            counter++;
        }

        const writeStream = fs.createWriteStream(filePath);
        let receivedBytes = 0;
        let progressThrottle = 0;
        let aborted = false;

        const cleanupFailedFile = () => {
            try { writeStream.destroy(); } catch { /* ignore */ }
            fs.promises.unlink(filePath).catch(() => { /* ignore */ });
        };

        req.on('data', (chunk: Buffer) => {
            if (aborted) return;
            receivedBytes += chunk.length;

            // Enforce size cap even if Content-Length lied
            if (receivedBytes > MAX_UPLOAD_BYTES) {
                aborted = true;
                cleanupFailedFile();
                if (!res.headersSent) res.status(413).json({ error: 'File too large' });
                req.destroy();
                return;
            }

            // Notify desktop UI at most ~10x/sec
            const now = Date.now();
            if (contentLength > 0 && now - progressThrottle > 100) {
                progressThrottle = now;
                const percent = Math.min(100, Math.round((receivedBytes / contentLength) * 100));
                notifyMainWindow('transfer-progress', { fileName: savedName, percent });
            }
        });

        req.on('aborted', () => {
            aborted = true;
            cleanupFailedFile();
            if (!res.headersSent) res.status(499).json({ error: 'Client aborted' });
        });

        writeStream.on('error', (err) => {
            aborted = true;
            console.error('[upload] write error:', err);
            cleanupFailedFile();
            if (!res.headersSent) res.status(500).json({ error: 'Write failed' });
        });

        writeStream.on('finish', () => {
            if (aborted) return;
            notifyMainWindow('transfer-progress', { fileName: savedName, percent: 100 });
            notifyMainWindow('file-received', { name: savedName, path: filePath });
            res.status(200).json({ savedAs: savedName, size: receivedBytes });
        });

        req.pipe(writeStream);
    });

    expressApp.get('/api/download/:fileId', (req, res) => {
        const { fileId } = req.params;

        // Validate fileId format to prevent path traversal
        if (!/^[a-f0-9]{12}$/.test(fileId)) {
            res.status(400).send('Invalid file ID');
            return;
        }

        const sharedFilesPath = path.join(app.getPath('userData'), 'shared-files.json');

        try {
            if (fs.existsSync(sharedFilesPath)) {
                const sharedFiles = JSON.parse(fs.readFileSync(sharedFilesPath, 'utf-8'));
                const fileInfo = sharedFiles[fileId];

                if (fileInfo && fs.existsSync(fileInfo.path)) {
                    const resolvedPath = path.resolve(fileInfo.path);
                    // Ensure path is absolute and contains no traversal sequences
                    if (!path.isAbsolute(resolvedPath) || resolvedPath.includes('..')) {
                        res.status(403).send('Forbidden');
                        return;
                    }
                    res.download(resolvedPath, path.basename(fileInfo.name));
                    return;
                }
            }
            res.status(404).send('File not found');
        } catch {
            res.status(500).send('Error reading file');
        }
    });

    // Dev mode: proxy non-API requests to Vite dev server (port 5173)
    // so mobile clients always get the latest code with hot reload.
    // Production: serve pre-built static files from dist.
    if (isDev) {
        expressApp.use((req, res, next) => {
            if (req.url?.startsWith('/api/')) return next();

            const proxyReq = httpRequest({
                hostname: 'localhost',
                port: 5173,
                path: req.url,
                method: req.method,
                headers: { ...req.headers, host: 'localhost:5173' },
            }, (proxyRes) => {
                // Copy headers, preserving content-type for JS/CSS/HTML
                const headers = { ...proxyRes.headers };
                res.writeHead(proxyRes.statusCode || 200, headers);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (err) => {
                console.error('[proxy] Vite proxy error:', err.message);
                // Fallback: try static dist if Vite is not running
                next();
            });

            req.pipe(proxyReq);
        });
    }

    // Serve static files (production, or dev fallback if Vite is down)
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
            if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
                console.log('Server running at', serverInfo.url);
            }
            resolve();
        });

        let portRetries = 0;
        server!.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE' && portRetries < 10) {
                portRetries++;
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
