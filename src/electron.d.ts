/// <reference types="vite/client" />

interface ElectronAPI {
    getServerInfo: () => Promise<{
        ip: string;
        port: number;
        sessionCode: string;
        url: string;
    }>;
    getDownloadsPath: () => Promise<string>;
    openFolder: (path: string) => Promise<void>;
    selectFiles: () => Promise<string[]>;
    shareFiles: (filePaths: string[]) => Promise<string[]>;
    onFileReceived: (callback: (file: { name: string; path: string }) => void) => () => void;
    onClientConnected: (callback: (client: { id: string }) => void) => () => void;
    onClientDisconnected: (callback: (client: { id: string }) => void) => () => void;
    onTransferProgress: (callback: (progress: { fileName: string; percent: number }) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };
