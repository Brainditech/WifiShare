import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { startServer, stopServer, getServerInfo } from './server';
import { shareFile } from './server/websocket';

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
    mainWindow = new BrowserWindow({
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
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    // Start the file transfer server
    await startServer();

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    stopServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers
ipcMain.handle('get-server-info', () => {
    return getServerInfo();
});

ipcMain.handle('get-downloads-path', () => {
    return app.getPath('downloads');
});

ipcMain.handle('open-folder', async (_, folderPath: string) => {
    await shell.openPath(folderPath);
});

ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile', 'multiSelections'],
    });
    return result.filePaths;
});

// Partager des fichiers avec les clients connectés
ipcMain.handle('share-files', (_, filePaths: string[]) => {
    const sharedFileIds: string[] = [];
    for (const filePath of filePaths) {
        const fileId = shareFile(filePath);
        sharedFileIds.push(fileId);
        console.log(`Shared file: ${filePath} (ID: ${fileId})`);
    }
    return sharedFileIds;
});
