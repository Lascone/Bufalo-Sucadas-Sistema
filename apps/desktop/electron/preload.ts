import { contextBridge, ipcRenderer } from 'electron';

export type FerroGestorApi = {
  getAppInfo: () => Promise<{
    version: string;
    name: string;
    company: string;
    isPackaged: boolean;
    dbPath: string;
    dataPath: string;
    userDataDir: string;
    backupDir: string;
  }>;
  getSyncSnapshot: () => Promise<unknown>;
  runSyncNow: () => Promise<unknown>;
  enqueueSync: (op: unknown) => Promise<unknown>;
  createBackup: (reason?: string) => Promise<unknown>;
  listBackups: () => Promise<unknown>;
  loadDataStore: () => Promise<{ data: Record<string, unknown>; stats: unknown }>;
  persistData: (partial: Record<string, unknown>) => Promise<{ ok: boolean }>;
  importAllData: (data: Record<string, unknown>) => Promise<{ ok: boolean; stats: unknown }>;
  runDataDiagnostic: () => Promise<unknown>;
  restoreDataFile: (filePath: string) => Promise<{ ok: boolean; data: Record<string, unknown> }>;
  backupDataNow: () => Promise<{ ok: boolean; path: string | null }>;
  openDataFolder: (which: 'userData' | 'data' | 'backups') => Promise<{ ok: boolean; path: string }>;
  checkForUpdates: () => Promise<unknown>;
  downloadUpdate: () => Promise<unknown>;
  installUpdate: () => Promise<unknown>;
  onUpdaterEvent: (channel: string, cb: (payload: unknown) => void) => () => void;
  saveMaterialPhoto: (payload: {
    materialId: string;
    base64: string;
    ext: string;
  }) => Promise<{ photoPath: string; fullPath: string }>;
  getMaterialPhotoDataUrl: (photoPath: string) => Promise<string | null>;
  deleteMaterialPhoto: (photoPath: string) => Promise<boolean>;
  sharePdfWhatsApp: (payload: {
    fileName: string;
    base64: string;
    caption?: string;
  }) => Promise<{
    ok: true;
    fullPath: string;
    whatsapp: 'desktop' | 'protocol' | 'web';
    hint: string;
  }>;
  getSession: () => Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    user: {
      id: string;
      username: string;
      companyId: string;
      branchId: string | null;
      roleCode: string;
    };
    deviceId: string | null;
    deviceName: string;
    apiBaseUrl: string;
  } | null>;
  login: (input: {
    apiBaseUrl: string;
    username: string;
    password: string;
    deviceName: string;
  }) => Promise<unknown>;
  logout: () => Promise<{ ok: boolean }>;
  onRemoteChanges: (cb: (payload: { count: number }) => void) => () => void;
  onOutboxSnapshot: (cb: (payload: unknown) => void) => () => void;
};

const api: FerroGestorApi = {
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getSyncSnapshot: () => ipcRenderer.invoke('sync:getSnapshot'),
  runSyncNow: () => ipcRenderer.invoke('sync:runNow'),
  enqueueSync: (op) => ipcRenderer.invoke('sync:enqueue', op),
  createBackup: (reason) => ipcRenderer.invoke('backup:create', reason),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  loadDataStore: () => ipcRenderer.invoke('data:load'),
  persistData: (partial) => ipcRenderer.invoke('data:persist', partial),
  importAllData: (data) => ipcRenderer.invoke('data:importAll', data),
  runDataDiagnostic: () => ipcRenderer.invoke('data:diagnose'),
  restoreDataFile: (filePath) => ipcRenderer.invoke('data:restoreFile', filePath),
  backupDataNow: () => ipcRenderer.invoke('data:backupNow'),
  openDataFolder: (which) => ipcRenderer.invoke('data:openFolder', which),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterEvent: (channel, cb) => {
    const listener = (_: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  saveMaterialPhoto: (payload) => ipcRenderer.invoke('media:saveMaterialPhoto', payload),
  getMaterialPhotoDataUrl: (photoPath) =>
    ipcRenderer.invoke('media:getMaterialPhotoDataUrl', photoPath),
  deleteMaterialPhoto: (photoPath) =>
    ipcRenderer.invoke('media:deleteMaterialPhoto', photoPath),
  sharePdfWhatsApp: (payload) => ipcRenderer.invoke('share:pdfWhatsApp', payload),
  getSession: () => ipcRenderer.invoke('auth:getSession'),
  login: (input) => ipcRenderer.invoke('auth:login', input),
  logout: () => ipcRenderer.invoke('auth:logout'),
  onRemoteChanges: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, payload: { count: number }) => cb(payload);
    ipcRenderer.on('remote:changes-applied', listener);
    return () => ipcRenderer.removeListener('remote:changes-applied', listener);
  },
  onOutboxSnapshot: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
    ipcRenderer.on('outbox:snapshot', listener);
    return () => ipcRenderer.removeListener('outbox:snapshot', listener);
  },
};

contextBridge.exposeInMainWorld('ferrogestor', api);
