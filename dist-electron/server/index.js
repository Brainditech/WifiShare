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
let server = null;
let wss = null;
let serverInfo = {
    ip: '',
    port: 3847,
    sessionCode: '',
    url: '',
};
async function startServer() {
    const expressApp = (0, express_1.default)();
    // Get local IP and generate session code
    serverInfo.ip = (0, network_1.getLocalIP)();
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
    console.log('=== WiFiShare Server ===');
    console.log('IP:', serverInfo.ip);
    console.log('Port:', serverInfo.port);
    console.log('Session Code:', serverInfo.sessionCode);
    console.log('URL:', serverInfo.url);
    console.log('Static Path:', staticPath);
    console.log('Static exists:', fs.existsSync(staticPath));
    // Middleware
    expressApp.use(express_1.default.json({ limit: '50mb' }));
    // API routes BEFORE static files
    expressApp.get('/api/info', (req, res) => {
        res.json({
            sessionCode: serverInfo.sessionCode,
            serverName: 'WiFiShare Desktop',
        });
    });
    expressApp.get('/api/download/:fileId', (req, res) => {
        const { fileId } = req.params;
        const sharedFilesPath = path.join(electron_1.app.getPath('userData'), 'shared-files.json');
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
        }
        catch {
            res.status(500).send('Error reading file');
        }
    });
    // Serve static files
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
            console.log('Server running at', serverInfo.url);
            resolve();
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
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
