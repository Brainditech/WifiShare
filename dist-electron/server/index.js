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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
exports.stopServer = stopServer;
exports.getServerInfo = getServerInfo;
exports.notifyMainWindow = notifyMainWindow;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("ws");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const electron_1 = require("electron");
const network_1 = require("./utils/network");
const session_1 = require("./utils/session");
const websocket_1 = require("./websocket");
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB hard cap per file
let server = null;
let wss = null;
const serverInfo = {
    ip: '',
    port: 3847,
    sessionCode: '',
    url: '',
};
async function startServer() {
    const expressApp = (0, express_1.default)();
    // Get local IP and generate session code
    serverInfo.ip = await (0, network_1.getLocalIP)();
    serverInfo.sessionCode = (0, session_1.generateSessionCode)();
    // URL simple sans /s/ - le code est en query parameter
    serverInfo.url = `http://${serverInfo.ip}:${serverInfo.port}/?code=${serverInfo.sessionCode}`;
    // Determine static files path
    let staticPath;
    if (electron_1.app.isPackaged) {
        staticPath = path.join(process.resourcesPath, 'web-client');
    }
    else {
        staticPath = path.join(__dirname, '..', '..', 'dist');
        if (!fs.existsSync(staticPath)) {
            staticPath = path.join(process.cwd(), 'dist');
        }
    }
    const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
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
    expressApp.use(express_1.default.json({ limit: '50mb' }));
    // API routes BEFORE static files
    expressApp.get('/api/info', (_req, res) => {
        res.json({ serverName: 'WiFiShare Desktop' });
    });
    // POST /api/upload — robust HTTP upload from web client.
    // Replaces the WS chunked transfer: the browser streams the file natively,
    // which survives backgrounding, mobile file pickers, and slow networks.
    // Auth: X-Session-Code header (same code as WS auth).
    // Filename: X-Filename header (URL-encoded). Size cap: MAX_UPLOAD_BYTES.
    expressApp.post('/api/upload', (req, res) => {
        const providedCode = req.headers['x-session-code'];
        if (typeof providedCode !== 'string' || providedCode !== serverInfo.sessionCode) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const rawHeader = req.headers['x-filename'];
        let rawName;
        try {
            rawName = decodeURIComponent(typeof rawHeader === 'string' ? rawHeader : '');
        }
        catch {
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
        const wifiShareFolder = path.join(electron_1.app.getPath('downloads'), 'WiFiShare');
        if (!fs.existsSync(wifiShareFolder))
            fs.mkdirSync(wifiShareFolder, { recursive: true });
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
            try {
                writeStream.destroy();
            }
            catch { /* ignore */ }
            fs.promises.unlink(filePath).catch(() => { });
        };
        req.on('data', (chunk) => {
            if (aborted)
                return;
            receivedBytes += chunk.length;
            // Enforce size cap even if Content-Length lied
            if (receivedBytes > MAX_UPLOAD_BYTES) {
                aborted = true;
                cleanupFailedFile();
                if (!res.headersSent)
                    res.status(413).json({ error: 'File too large' });
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
            if (!res.headersSent)
                res.status(499).json({ error: 'Client aborted' });
        });
        writeStream.on('error', (err) => {
            aborted = true;
            console.error('[upload] write error:', err);
            cleanupFailedFile();
            if (!res.headersSent)
                res.status(500).json({ error: 'Write failed' });
        });
        writeStream.on('finish', () => {
            if (aborted)
                return;
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
        const sharedFilesPath = path.join(electron_1.app.getPath('userData'), 'shared-files.json');
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
        }
        catch {
            res.status(500).send('Error reading file');
        }
    });
    // Dev mode: proxy non-API requests to Vite dev server (port 5173)
    // so mobile clients always get the latest code with hot reload.
    // Production: serve pre-built static files from dist.
    if (isDev) {
        expressApp.use((req, res, next) => {
            if (req.url?.startsWith('/api/'))
                return next();
            const proxyReq = (0, http_1.request)({
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
    expressApp.use(express_1.default.static(staticPath));
    // SPA fallback - serve index.html for all other routes
    expressApp.get('*', (req, res) => {
        const indexPath = path.join(staticPath, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        }
        else {
            res.status(404).send('index.html not found at ' + indexPath);
        }
    });
    // Create HTTP server
    server = (0, http_1.createServer)(expressApp);
    // Setup WebSocket server
    wss = new ws_1.WebSocketServer({ server });
    (0, websocket_1.setupWebSocket)(wss, serverInfo.sessionCode);
    // Start listening
    return new Promise((resolve, reject) => {
        server.listen(serverInfo.port, '0.0.0.0', () => {
            if (process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged) {
                console.log('Server running at', serverInfo.url);
            }
            resolve();
        });
        let portRetries = 0;
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE' && portRetries < 10) {
                portRetries++;
                serverInfo.port++;
                serverInfo.url = `http://${serverInfo.ip}:${serverInfo.port}/?code=${serverInfo.sessionCode}`;
                server.listen(serverInfo.port, '0.0.0.0');
            }
            else {
                reject(err);
            }
        });
    });
}
function stopServer() {
    if (wss) {
        wss.close();
        wss = null;
    }
    if (server) {
        server.close();
        server = null;
    }
}
function getServerInfo() {
    return serverInfo;
}
function notifyMainWindow(channel, data) {
    const windows = electron_1.BrowserWindow.getAllWindows();
    windows.forEach(win => {
        win.webContents.send(channel, data);
    });
}
