import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { autoUpdater } from 'electron-updater';
import { createBackup, listBackups, restoreBackup } from './backup';
import {
  createDataBackup,
  loadDataStore,
  mergeDataStore,
  persistNow,
  restoreFromFile,
} from './data-store';
import { runDataDiagnostic } from './data-recovery';
import { getLocalDbPath, ensureLocalDataDir, getDataDir, getBackupDir } from './local-db';
import { getSyncSnapshot, runSyncCycle } from './sync-engine';
import {
  enqueueAndFlush,
  flushOutbox,
  loginAndRegister,
  loadSession,
  clearSession,
  setOutboxWindow,
  startOutboxWorker,
} from './outbox-worker';

function distRoot() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist');
  }
  return path.join(__dirname, '../dist');
}

function publicRoot() {
  if (app.isPackaged) return distRoot();
  return path.join(__dirname, '../public');
}

process.env.DIST = distRoot();
process.env.VITE_PUBLIC = publicRoot();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const dist = distRoot();
  const pub = publicRoot();
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'Búfalo Sucata Gestor',
    backgroundColor: '#0B0B0B',
    icon: path.join(pub, 'icon.png'),
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
    mainWindow.loadFile(path.join(dist, 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  setOutboxWindow(mainWindow);
  mainWindow.on('closed', () => {
    setOutboxWindow(null);
    mainWindow = null;
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
    name: 'Búfalo Sucata Gestor',
    company: 'Búfalo Sucatas',
    isPackaged: app.isPackaged,
    dbPath: getLocalDbPath(),
    dataPath: path.join(getDataDir(), 'app-data.json'),
    userDataDir: app.getPath('userData'),
    backupDir: getBackupDir(),
  }));

  ipcMain.handle('data:load', () => {
    const data = loadDataStore();
    return { data, stats: runDataDiagnostic().currentStats };
  });

  ipcMain.handle('data:persist', (_e, payload: Record<string, unknown>) => {
    mergeDataStore(payload, 'renderer-save');
    return { ok: true };
  });

  ipcMain.handle('data:importAll', (_e, payload: Record<string, unknown>) => {
    persistNow(payload, 'import-localStorage');
    return { ok: true, stats: runDataDiagnostic().currentStats };
  });

  ipcMain.handle('data:diagnose', () => runDataDiagnostic());

  ipcMain.handle('data:restoreFile', (_e, filePath: string) => {
    const data = restoreFromFile(filePath);
    return { ok: true, data, stats: runDataDiagnostic().currentStats };
  });

  ipcMain.handle('data:backupNow', () => {
    const target = createDataBackup('manual');
    return { ok: true, path: target };
  });

  ipcMain.handle('data:openFolder', (_e, which: 'userData' | 'data' | 'backups') => {
    const target =
      which === 'backups'
        ? getBackupDir()
        : which === 'data'
          ? getDataDir()
          : app.getPath('userData');
    shell.openPath(target);
    return { ok: true, path: target };
  });

  ipcMain.handle('backup:restore', (_e, backupPath: string) => {
    restoreBackup(backupPath);
    return { ok: true };
  });

  ipcMain.handle('sync:getSnapshot', () => getSyncSnapshot());
  ipcMain.handle('sync:runNow', async () => flushOutbox());
  ipcMain.handle('sync:enqueue', (_e, op) => enqueueAndFlush(op));

  ipcMain.handle('auth:getSession', () => loadSession());
  ipcMain.handle('auth:login', async (_e, input) => loginAndRegister(input));
  ipcMain.handle('auth:logout', () => {
    clearSession();
    return { ok: true };
  });

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

  ipcMain.handle(
    'media:saveMaterialPhoto',
    async (
      _e,
      payload: { materialId: string; base64: string; ext: string },
    ) => {
      const mediaDir = path.join(app.getPath('userData'), 'media', 'materials');
      if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
      const ext = (payload.ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
      const fileName = `${payload.materialId}.${ext}`;
      const fullPath = path.join(mediaDir, fileName);
      const buf = Buffer.from(payload.base64, 'base64');
      fs.writeFileSync(fullPath, buf);
      return { photoPath: fileName, fullPath };
    },
  );

  ipcMain.handle('media:getMaterialPhotoDataUrl', async (_e, photoPath: string) => {
    if (!photoPath || photoPath.includes('..') || path.isAbsolute(photoPath)) {
      return null;
    }
    const fullPath = path.join(app.getPath('userData'), 'media', 'materials', photoPath);
    if (!fs.existsSync(fullPath)) return null;
    const buf = fs.readFileSync(fullPath);
    const ext = path.extname(photoPath).slice(1).toLowerCase() || 'jpeg';
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  });

  ipcMain.handle('media:deleteMaterialPhoto', async (_e, photoPath: string) => {
    if (!photoPath || photoPath.includes('..') || path.isAbsolute(photoPath)) {
      return false;
    }
    const fullPath = path.join(app.getPath('userData'), 'media', 'materials', photoPath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    return true;
  });

  ipcMain.handle(
    'share:pdfWhatsApp',
    async (
      _e,
      payload: { fileName: string; base64: string; caption?: string },
    ) => {
      const rawName = (payload.fileName || 'documento.pdf').replace(
        /[\\/:*?"<>|]/g,
        '_',
      );
      const fileName = rawName.toLowerCase().endsWith('.pdf')
        ? rawName
        : `${rawName}.pdf`;
      const exportsDir = path.join(app.getPath('userData'), 'exports');
      if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
      const fullPath = path.join(exportsDir, fileName);
      fs.writeFileSync(fullPath, Buffer.from(payload.base64, 'base64'));

      shell.showItemInFolder(fullPath);

      const opened = await openWhatsAppPreferred(payload.caption);
      return {
        ok: true as const,
        fullPath,
        whatsapp: opened,
        hint: 'PDF salvo. Anexe o arquivo na conversa do WhatsApp.',
      };
    },
  );
}

async function openWhatsAppPreferred(
  caption?: string,
): Promise<'desktop' | 'protocol' | 'web'> {
  const local = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || '';
  const candidates = [
    path.join(local, 'WhatsApp', 'WhatsApp.exe'),
    path.join(local, 'Programs', 'WhatsApp', 'WhatsApp.exe'),
    path.join(userProfile, 'AppData', 'Local', 'WhatsApp', 'WhatsApp.exe'),
  ];
  for (const exe of candidates) {
    if (exe && fs.existsSync(exe)) {
      const err = await shell.openPath(exe);
      if (!err) return 'desktop';
    }
  }

  try {
    const text = caption?.trim()
      ? `?text=${encodeURIComponent(caption.trim())}`
      : '';
    await shell.openExternal(`whatsapp://${text}`);
    return 'protocol';
  } catch {
    // fall through
  }

  await shell.openExternal('https://web.whatsapp.com/');
  return 'web';
}

app.whenReady().then(() => {
  ensureLocalDataDir();
  loadDataStore();
  createDataBackup('startup');
  setupAutoUpdater();
  registerIpc();
  createWindow();
  startOutboxWorker();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  try {
    createDataBackup('shutdown');
  } catch {
    // ignore backup errors on quit
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Ensure dist-electron resolves .ts modules compiled to .js
void fs;
