import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  shell,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createBackup, listBackups } from './backup';
import { getLocalDbPath, ensureLocalDataDir, wipeUserDataFolders } from './local-db';
import {
  archiveAndRotateDeviceOnWipe,
  listWipeArchives,
  listServerHistoryGroups,
  queryArchiveEntities,
  registerRetroactiveWipeArchive,
} from './wipe-archive';
import {
  getSyncSnapshot,
  enqueueSyncOp,
  runSyncCycle,
  listSyncConflicts,
  resolveSyncConflict,
  importFromDevice,
} from './sync-engine';
import {
  getSyncAuthStatus,
  connectCentral,
  getSyncSessionIds,
} from './sync-auth';
import { disconnectCentralPrisma } from './central-db';
import { exportPackToDialog, importPackFromDialog } from './data-pack';
import {
  readCentralConnection,
  writeCentralConnection,
  testPostgresConnection,
} from './central-connection';
import type { CentralConnectionConfig } from '@ferrogestor/shared';

/** CJS interop: Vite's default import of electron-updater breaks in packaged builds. */
const nodeRequire = createRequire(__filename);
const updaterMod = nodeRequire('electron-updater') as {
  autoUpdater?: import('electron-updater').AppUpdater;
  default?: { autoUpdater: import('electron-updater').AppUpdater };
};
const resolvedUpdater =
  updaterMod.autoUpdater ?? updaterMod.default?.autoUpdater;
if (!resolvedUpdater) {
  throw new Error('electron-updater não carregou (autoUpdater ausente)');
}
const autoUpdater = resolvedUpdater;

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
    height: 920,
    minWidth: 1024,
    minHeight: 720,
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

  // Menu nativo está desligado — F11 precisa ser tratado aqui
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      if (!mainWindow) return;
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      return;
    }
    if (input.key === 'Escape' && mainWindow?.isFullScreen()) {
      event.preventDefault();
      mainWindow.setFullScreen(false);
    }
  });

  // Após minimizar/restaurar ou voltar o foco, reativa input (Chromium às vezes “trava” mouse/teclado)
  const refocusWebContents = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.webContents.focus();
      mainWindow.focus();
    } catch {
      /* ignore */
    }
  };
  mainWindow.on('focus', refocusWebContents);
  mainWindow.on('restore', refocusWebContents);
  mainWindow.on('show', refocusWebContents);
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  // electron-builder publica latest.yml (não stable.yml)
  autoUpdater.channel = process.env.UPDATE_CHANNEL ?? 'latest';
  autoUpdater.allowPrerelease = false;

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
  }));

  ipcMain.handle('sync:getSnapshot', () => getSyncSnapshot());
  ipcMain.handle('sync:runNow', async (_e, opts?: {
    preferLocal?: boolean;
    pushOnly?: boolean;
    batchSize?: number;
  }) => runSyncCycle(opts));
  ipcMain.handle('sync:importFromDevice', async (_e, deviceId: string) =>
    importFromDevice(deviceId),
  );
  ipcMain.handle('sync:enqueue', (_e, op) => enqueueSyncOp(op));
  ipcMain.handle('sync:authStatus', () => getSyncAuthStatus());
  ipcMain.handle('sync:sessionIds', () => getSyncSessionIds());
  ipcMain.handle('sync:accessToken', async () => null);
  ipcMain.handle(
    'sync:login',
    async (_e, payload?: { deviceName?: string }) => connectCentral(payload),
  );
  ipcMain.handle('sync:listConflicts', async () => listSyncConflicts());
  ipcMain.handle(
    'sync:resolveConflict',
    async (
      _e,
      payload: {
        conflictId: string;
        resolution: 'KEEP_LOCAL' | 'KEEP_SERVER' | 'MERGE';
        justification: string;
        mergedPayload?: Record<string, unknown>;
      },
    ) => resolveSyncConflict(payload),
  );

  ipcMain.handle('central:getConnection', () => readCentralConnection());
  ipcMain.handle(
    'central:saveConnection',
    async (_e, cfg: CentralConnectionConfig) => {
      writeCentralConnection(cfg);
      await disconnectCentralPrisma();
      const connected = await connectCentral({
        deviceName: cfg.deviceName,
      });
      return { connection: readCentralConnection(), connect: connected };
    },
  );
  ipcMain.handle(
    'central:testPostgres',
    async (_e, cfg?: CentralConnectionConfig) => testPostgresConnection(cfg),
  );

  ipcMain.handle('backup:create', async (_e, reason?: string) =>
    createBackup(reason ?? 'manual'),
  );
  ipcMain.handle('backup:list', () => listBackups());

  ipcMain.handle(
    'data:wipeLocal',
    async (
      _e,
      opts?: {
        clearMedia?: boolean;
        clearExports?: boolean;
        clearBackups?: boolean;
        clearSyncQueue?: boolean;
        clearSqlite?: boolean;
      },
    ) => wipeUserDataFolders(opts),
  );

  ipcMain.handle(
    'archive:rotateOnWipe',
    async (_e, payload?: { note?: string }) =>
      archiveAndRotateDeviceOnWipe(payload),
  );
  ipcMain.handle('archive:listWipes', async () => listWipeArchives());
  ipcMain.handle('archive:listHistoryGroups', async () =>
    listServerHistoryGroups(),
  );
  ipcMain.handle(
    'archive:queryEntities',
    async (
      _e,
      payload: {
        archiveId?: string;
        deviceId?: string;
        from?: string;
        to?: string;
        entityTypes?: string[];
        limit?: number;
      },
    ) => queryArchiveEntities(payload ?? {}),
  );
  ipcMain.handle(
    'archive:registerRetroWipe',
    async (
      _e,
      payload: {
        deviceId: string;
        fromAt: string;
        toAt: string;
        note?: string;
      },
    ) => registerRetroactiveWipeArchive(payload),
  );

  ipcMain.handle(
    'data:exportPack',
    async (_e, payload: { store?: Record<string, unknown> }) => {
      const store =
        payload?.store && typeof payload.store === 'object' ? payload.store : {};
      return exportPackToDialog(mainWindow, store);
    },
  );

  ipcMain.handle('data:importPack', async () => importPackFromDialog(mainWindow));

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
      const base = rawName.toLowerCase().endsWith('.pdf')
        ? rawName.slice(0, -4)
        : rawName;
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      const fileName = `${base}_${stamp}.pdf`;
      const exportsDir = path.join(app.getPath('userData'), 'exports');
      if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
      const fullPath = path.join(exportsDir, fileName);
      fs.writeFileSync(fullPath, Buffer.from(payload.base64, 'base64'));

      // Caminho no clipboard → no WhatsApp Desktop dá para colar/anexar com Ctrl+V
      clipboard.writeText(fullPath);
      shell.showItemInFolder(fullPath);

      const opened = await openWhatsAppPreferred({
        caption: payload.caption,
        fullPath,
      });
      return {
        ok: true as const,
        fullPath,
        whatsapp: opened,
        hint:
          'PDF destacado no Explorer e caminho copiado. Abra/cole na conversa do WhatsApp (Ctrl+V) ou anexe o arquivo selecionado.',
      };
    },
  );
}

async function tryOpenExternal(url: string): Promise<boolean> {
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
}

function findWhatsAppExe(): string | null {
  const local = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || '';
  const candidates = [
    path.join(local, 'WhatsApp', 'WhatsApp.exe'),
    path.join(local, 'Programs', 'WhatsApp', 'WhatsApp.exe'),
    path.join(userProfile, 'AppData', 'Local', 'WhatsApp', 'WhatsApp.exe'),
    path.join(local, 'WhatsAppDesktop', 'WhatsApp.exe'),
  ];
  for (const exe of candidates) {
    if (exe && fs.existsSync(exe)) return exe;
  }
  // Builds tipo Electron (app-x.y.z\WhatsApp.exe)
  for (const root of [
    path.join(local, 'WhatsApp'),
    path.join(local, 'Programs', 'WhatsApp'),
  ]) {
    if (!fs.existsSync(root)) continue;
    try {
      const apps = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('app-'))
        .map((d) => d.name)
        .sort()
        .reverse();
      for (const dir of apps) {
        const exe = path.join(root, dir, 'WhatsApp.exe');
        if (fs.existsSync(exe)) return exe;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function truncateShareText(text: string, max = 1400): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Abre o fluxo de envio no WhatsApp (app registrado ou Web).
 * Não dá para anexar PDF via API do WhatsApp — salvamos o arquivo, abrimos o
 * diálogo de mensagem e deixamos o caminho no clipboard / Explorer.
 */
async function openWhatsAppPreferred(opts: {
  caption?: string;
  fullPath: string;
}): Promise<'desktop' | 'protocol' | 'web'> {
  const message = truncateShareText(
    [opts.caption?.trim(), `Anexo: ${opts.fullPath}`]
      .filter(Boolean)
      .join('\n\n'),
  );
  const encoded = encodeURIComponent(message);

  // 1) Link oficial — abre app Desktop se instalado, senão WhatsApp Web
  if (await tryOpenExternal(`https://api.whatsapp.com/send?text=${encoded}`)) {
    return 'web';
  }

  // 2) Protocolo nativo (App Desktop / Store)
  if (await tryOpenExternal(`whatsapp://send?text=${encoded}`)) {
    return 'protocol';
  }

  // 3) WhatsApp Web com texto pré-preenchido
  if (
    await tryOpenExternal(`https://web.whatsapp.com/send?text=${encoded}`)
  ) {
    return 'web';
  }

  // 4) Só abre o .exe se existir (sem conversa — último recurso)
  const exe = findWhatsAppExe();
  if (exe) {
    const err = await shell.openPath(exe);
    if (!err) return 'desktop';
    // Store / shell:Start
    try {
      spawn('cmd', ['/c', 'start', '', 'whatsapp:'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      return 'desktop';
    } catch {
      // fall through
    }
  }

  await tryOpenExternal('https://web.whatsapp.com/');
  return 'web';
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
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

app.on('will-quit', () => {
  void disconnectCentralPrisma();
});

// Ensure dist-electron resolves .ts modules compiled to .js
void fs;
