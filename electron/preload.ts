import { contextBridge, ipcRenderer } from 'electron';

export interface ServerInfo {
    ip: string;
    port: number;
    sessionCode: string;
    url: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
    getServerInfo: (): Promise<ServerInfo> => ipcRenderer.invoke('get-server-info'),
    getDownloadsPath: (): Promise<string> => ipcRenderer.invoke('get-downloads-path'),
    openFolder: (path: string): Promise<void> => ipcRenderer.invoke('open-folder', path),
    selectFiles: (): Promise<string[]> => ipcRenderer.invoke('select-files'),
    shareFiles: (filePaths: string[]): Promise<string[]> => ipcRenderer.invoke('share-files', filePaths),

    // Event listeners for real-time updates
    onFileReceived: (callback: (file: { name: string; path: string }) => void) => {
        ipcRenderer.on('file-received', (_, file) => callback(file));
        return () => ipcRenderer.removeAllListeners('file-received');
    },

    onClientConnected: (callback: (client: { id: string }) => void) => {
        ipcRenderer.on('client-connected', (_, client) => callback(client));
        return () => ipcRenderer.removeAllListeners('client-connected');
    },

    onClientDisconnected: (callback: (client: { id: string }) => void) => {
        ipcRenderer.on('client-disconnected', (_, client) => callback(client));
        return () => ipcRenderer.removeAllListeners('client-disconnected');
    },

    onTransferProgress: (callback: (progress: { fileName: string; percent: number }) => void) => {
        ipcRenderer.on('transfer-progress', (_, progress) => callback(progress));
        return () => ipcRenderer.removeAllListeners('transfer-progress');
    },
});

// Type declaration for the renderer process
declare global {
    interface Window {
        electronAPI: {
            getServerInfo: () => Promise<ServerInfo>;
            getDownloadsPath: () => Promise<string>;
            openFolder: (path: string) => Promise<void>;
            selectFiles: () => Promise<string[]>;
            shareFiles: (filePaths: string[]) => Promise<string[]>;
            onFileReceived: (callback: (file: { name: string; path: string }) => void) => () => void;
            onClientConnected: (callback: (client: { id: string }) => void) => () => void;
            onClientDisconnected: (callback: (client: { id: string }) => void) => () => void;
            onTransferProgress: (callback: (progress: { fileName: string; percent: number }) => void) => () => void;
        };
    }
}
