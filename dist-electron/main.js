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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const server_1 = require("./server");
const websocket_1 = require("./server/websocket");
let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 900,
        height: 700,
        minWidth: 600,
        minHeight: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // Désactiver l'autofill pour éviter les warnings
            disableBlinkFeatures: 'Autofill',
        },
        icon: path.join(__dirname, '../public/icon.png'),
        title: 'WiFiShare',
        autoHideMenuBar: true,
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173?mode=desktop');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(async () => {
    // Start the file transfer server
    await (0, server_1.startServer)();
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    (0, server_1.stopServer)();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// IPC Handlers
electron_1.ipcMain.handle('get-server-info', () => {
    return (0, server_1.getServerInfo)();
});
electron_1.ipcMain.handle('get-downloads-path', () => {
    return electron_1.app.getPath('downloads');
});
electron_1.ipcMain.handle('open-folder', async (_, folderPath) => {
    await electron_1.shell.openPath(folderPath);
});
electron_1.ipcMain.handle('select-files', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
    });
    return result.filePaths;
});
// Partager des fichiers avec les clients connectés
electron_1.ipcMain.handle('share-files', (_, filePaths) => {
    const sharedFileIds = [];
    for (const filePath of filePaths) {
        const fileId = (0, websocket_1.shareFile)(filePath);
        sharedFileIds.push(fileId);
        console.log(`Shared file: ${filePath} (ID: ${fileId})`);
    }
    return sharedFileIds;
});
