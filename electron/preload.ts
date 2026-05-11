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
        const listener = (_: Electron.IpcRendererEvent, file: { name: string; path: string }) => callback(file);
        ipcRenderer.on('file-received', listener);
        return () => ipcRenderer.removeListener('file-received', listener);
    },

    onClientConnected: (callback: (client: { id: string }) => void) => {
        const listener = (_: Electron.IpcRendererEvent, client: { id: string }) => callback(client);
        ipcRenderer.on('client-connected', listener);
        return () => ipcRenderer.removeListener('client-connected', listener);
    },

    onClientDisconnected: (callback: (client: { id: string }) => void) => {
        const listener = (_: Electron.IpcRendererEvent, client: { id: string }) => callback(client);
        ipcRenderer.on('client-disconnected', listener);
        return () => ipcRenderer.removeListener('client-disconnected', listener);
    },

    onTransferProgress: (callback: (progress: { fileName: string; percent: number }) => void) => {
        const listener = (_: Electron.IpcRendererEvent, progress: { fileName: string; percent: number }) => callback(progress);
        ipcRenderer.on('transfer-progress', listener);
        return () => ipcRenderer.removeListener('transfer-progress', listener);
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
