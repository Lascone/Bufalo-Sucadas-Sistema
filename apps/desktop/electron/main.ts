import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { autoUpdater } from 'electron-updater';
import { createBackup, listBackups } from './backup';
import { getLocalDbPath, ensureLocalDataDir } from './local-db';
import { getSyncSnapshot, enqueueSyncOp, runSyncCycle } from './sync-engine';

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, '../public');

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'FerroGestor — Bufalo Sucatas',
    backgroundColor: '#1c242b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.channel = process.env.UPDATE_CHANNEL ?? 'stable';

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:available', info);
  });
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('updater:not-available');
  });
  autoUpdater.on('download-progress', (p) => {
    mainWindow?.webContents.send('updater:progress', p);
  });
  autoUpdater.on('update-downloaded', async (info) => {
    try {
      await createBackup('pre-update');
      mainWindow?.webContents.send('updater:downloaded', info);
    } catch (err) {
      mainWindow?.webContents.send('updater:error', String(err));
    }
  });
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:error', String(err));
  });
}

function registerIpc() {
  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    name: 'FerroGestor',
    company: 'Bufalo Sucatas',
    isPackaged: app.isPackaged,
    dbPath: getLocalDbPath(),
  }));

  ipcMain.handle('sync:getSnapshot', () => getSyncSnapshot());
  ipcMain.handle('sync:runNow', async () => runSyncCycle());
  ipcMain.handle('sync:enqueue', (_e, op) => enqueueSyncOp(op));

  ipcMain.handle('backup:create', async (_e, reason?: string) =>
    createBackup(reason ?? 'manual'),
  );
  ipcMain.handle('backup:list', () => listBackups());

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { skipped: true, reason: 'dev-mode' };
    return autoUpdater.checkForUpdates();
  });
  ipcMain.handle('updater:download', async () => {
    await createBackup('pre-update-download');
    return autoUpdater.downloadUpdate();
  });
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

app.whenReady().then(() => {
  ensureLocalDataDir();
  setupAutoUpdater();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Ensure dist-electron resolves .ts modules compiled to .js
void fs;
