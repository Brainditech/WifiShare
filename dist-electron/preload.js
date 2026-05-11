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
        const listener = (_, file) => callback(file);
        electron_1.ipcRenderer.on('file-received', listener);
        return () => electron_1.ipcRenderer.removeListener('file-received', listener);
    },
    onClientConnected: (callback) => {
        const listener = (_, client) => callback(client);
        electron_1.ipcRenderer.on('client-connected', listener);
        return () => electron_1.ipcRenderer.removeListener('client-connected', listener);
    },
    onClientDisconnected: (callback) => {
        const listener = (_, client) => callback(client);
        electron_1.ipcRenderer.on('client-disconnected', listener);
        return () => electron_1.ipcRenderer.removeListener('client-disconnected', listener);
    },
    onTransferProgress: (callback) => {
        const listener = (_, progress) => callback(progress);
        electron_1.ipcRenderer.on('transfer-progress', listener);
        return () => electron_1.ipcRenderer.removeListener('transfer-progress', listener);
    },
});
