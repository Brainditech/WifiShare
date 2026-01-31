"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getServerInfo: () => electron_1.ipcRenderer.invoke('get-server-info'),
    getDownloadsPath: () => electron_1.ipcRenderer.invoke('get-downloads-path'),
    openFolder: (path) => electron_1.ipcRenderer.invoke('open-folder', path),
    selectFiles: () => electron_1.ipcRenderer.invoke('select-files'),
    shareFiles: (filePaths) => electron_1.ipcRenderer.invoke('share-files', filePaths),
    // Event listeners for real-time updates
    onFileReceived: (callback) => {
        electron_1.ipcRenderer.on('file-received', (_, file) => callback(file));
        return () => electron_1.ipcRenderer.removeAllListeners('file-received');
    },
    onClientConnected: (callback) => {
        electron_1.ipcRenderer.on('client-connected', (_, client) => callback(client));
        return () => electron_1.ipcRenderer.removeAllListeners('client-connected');
    },
    onClientDisconnected: (callback) => {
        electron_1.ipcRenderer.on('client-disconnected', (_, client) => callback(client));
        return () => electron_1.ipcRenderer.removeAllListeners('client-disconnected');
    },
    onTransferProgress: (callback) => {
        electron_1.ipcRenderer.on('transfer-progress', (_, progress) => callback(progress));
        return () => electron_1.ipcRenderer.removeAllListeners('transfer-progress');
    },
});
