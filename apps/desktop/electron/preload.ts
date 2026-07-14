import { contextBridge, ipcRenderer } from 'electron';

export type FerroGestorApi = {
  getAppInfo: () => Promise<{
    version: string;
    name: string;
    company: string;
    isPackaged: boolean;
    dbPath: string;
  }>;
  getSyncSnapshot: () => Promise<unknown>;
  runSyncNow: () => Promise<unknown>;
  enqueueSync: (op: unknown) => Promise<unknown>;
  createBackup: (reason?: string) => Promise<unknown>;
  listBackups: () => Promise<unknown>;
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
};

const api: FerroGestorApi = {
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getSyncSnapshot: () => ipcRenderer.invoke('sync:getSnapshot'),
  runSyncNow: () => ipcRenderer.invoke('sync:runNow'),
  enqueueSync: (op) => ipcRenderer.invoke('sync:enqueue', op),
  createBackup: (reason) => ipcRenderer.invoke('backup:create', reason),
  listBackups: () => ipcRenderer.invoke('backup:list'),
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
};

contextBridge.exposeInMainWorld('ferrogestor', api);
