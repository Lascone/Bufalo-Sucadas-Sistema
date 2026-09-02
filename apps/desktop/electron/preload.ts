import { contextBridge, ipcRenderer, webFrame } from 'electron';

export type CentralConnectionDto = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  deviceName?: string;
};

export type FerroGestorApi = {
  getAppInfo: () => Promise<{
    version: string;
    name: string;
    company: string;
    isPackaged: boolean;
    dbPath: string;
  }>;
  getSyncSnapshot: () => Promise<unknown>;
  runSyncNow: (opts?: {
    preferLocal?: boolean;
    pushOnly?: boolean;
    batchSize?: number;
  }) => Promise<unknown>;
  importFromDevice: (
    deviceId: string,
  ) => Promise<
    | {
        ok: true;
        operations: Array<{
          originOperationId: string;
          entityType: string;
          entityId: string;
          action: string;
          payload: Record<string, unknown>;
          version: number;
          occurredAt: string;
        }>;
        count: number;
      }
    | { ok: false; error: string }
  >;
  enqueueSync: (op: unknown) => Promise<unknown>;
  getSyncAuthStatus: () => Promise<{
    configured: boolean;
    username: string;
    deviceId: string;
    deviceName: string;
    companyId: string | null;
    companyName: string | null;
    connectedAt: string | null;
    pgHost: string;
    pgDatabase: string;
  }>;
  getSyncSessionIds: () => Promise<{
    companyId: string | null;
    branchId: string | null;
    deviceId: string;
    userId: string | null;
  }>;
  loginSync: (payload?: {
    deviceName?: string;
  }) => Promise<{ ok: true; status: unknown } | { ok: false; error: string }>;
  listSyncConflicts: () => Promise<unknown[]>;
  resolveSyncConflict: (payload: {
    conflictId: string;
    resolution: 'KEEP_LOCAL' | 'KEEP_SERVER' | 'MERGE';
    justification: string;
    mergedPayload?: Record<string, unknown>;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  wipeUserData: (opts?: {
    clearMedia?: boolean;
    clearExports?: boolean;
    clearBackups?: boolean;
    clearSyncQueue?: boolean;
    clearSqlite?: boolean;
  }) => Promise<{ ok: true; cleared: string[] }>;
  archiveRotateOnWipe: (payload?: {
    note?: string;
  }) => Promise<
    | {
        ok: true;
        archive?: {
          id: string;
          archivedName: string;
          fromAt: string;
          toAt: string;
        };
        archivedName?: string;
        offline?: boolean;
        message?: string;
      }
    | { ok: false; error: string }
  >;
  listWipeArchives: () => Promise<
    | {
        ok: true;
        archives: Array<{
          id: string;
          archivedDeviceId: string;
          archivedName: string;
          fromAt: string;
          toAt: string;
          note: string | null;
          createdAt: string;
        }>;
      }
    | { ok: false; error: string }
  >;
  listArchiveHistoryGroups: () => Promise<
    | {
        ok: true;
        groups: Array<{
          deviceId: string;
          deviceName: string;
          fromAt: string;
          toAt: string;
          entityCount: number;
          hasWipeArchive: boolean;
          wipeArchiveId: string | null;
        }>;
      }
    | { ok: false; error: string }
  >;
  queryArchiveEntities: (payload: {
    archiveId?: string;
    deviceId?: string;
    from?: string;
    to?: string;
    entityTypes?: string[];
    limit?: number;
  }) => Promise<
    | {
        ok: true;
        entities: Array<{
          id: string;
          deviceId: string | null;
          entityType: string;
          payload: Record<string, unknown>;
          createdAt: string;
          updatedAt: string;
        }>;
      }
    | { ok: false; error: string }
  >;
  registerRetroWipeArchive: (payload: {
    deviceId: string;
    fromAt: string;
    toAt: string;
    note?: string;
  }) => Promise<{ ok: true; archive: unknown } | { ok: false; error: string }>;
  exportDataPack: (payload: {
    store: Record<string, unknown>;
  }) => Promise<
    | { ok: true; path: string; keyCount: number; mediaCount: number }
    | { ok: false; cancelled: true }
    | { ok: false; error: string }
  >;
  importDataPack: () => Promise<
    | {
        ok: true;
        path: string;
        store: Record<string, unknown>;
        keyCount: number;
        mediaCount: number;
        exportedAt?: string;
        appVersion?: string;
      }
    | { ok: false; cancelled: true }
    | { ok: false; error: string }
  >;
  getCentralConnection: () => Promise<CentralConnectionDto>;
  saveCentralConnection: (cfg: CentralConnectionDto) => Promise<{
    connection: CentralConnectionDto;
    connect: { ok: true; status: unknown } | { ok: false; error: string };
  }>;
  testCentralPostgres: (
    cfg?: CentralConnectionDto,
  ) => Promise<{ ok: true; detail: string } | { ok: false; error: string }>;
  setZoomFactor: (factor: number) => void;
  getZoomFactor: () => number;
};

const api: FerroGestorApi = {
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  getSyncSnapshot: () => ipcRenderer.invoke('sync:getSnapshot'),
  runSyncNow: (opts) => ipcRenderer.invoke('sync:runNow', opts),
  importFromDevice: (deviceId) =>
    ipcRenderer.invoke('sync:importFromDevice', deviceId),
  enqueueSync: (op) => ipcRenderer.invoke('sync:enqueue', op),
  getSyncAuthStatus: () => ipcRenderer.invoke('sync:authStatus'),
  getSyncSessionIds: () => ipcRenderer.invoke('sync:sessionIds'),
  loginSync: (payload) => ipcRenderer.invoke('sync:login', payload),
  listSyncConflicts: () => ipcRenderer.invoke('sync:listConflicts'),
  resolveSyncConflict: (payload) =>
    ipcRenderer.invoke('sync:resolveConflict', payload),
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
  sharePdfWhatsApp: (payload) => ipcRenderer.invoke('share:pdfWhatsApp', payload),
  wipeUserData: (opts) => ipcRenderer.invoke('data:wipeLocal', opts),
  archiveRotateOnWipe: (payload) =>
    ipcRenderer.invoke('archive:rotateOnWipe', payload),
  listWipeArchives: () => ipcRenderer.invoke('archive:listWipes'),
  listArchiveHistoryGroups: () =>
    ipcRenderer.invoke('archive:listHistoryGroups'),
  queryArchiveEntities: (payload) =>
    ipcRenderer.invoke('archive:queryEntities', payload),
  registerRetroWipeArchive: (payload) =>
    ipcRenderer.invoke('archive:registerRetroWipe', payload),
  exportDataPack: (payload) => ipcRenderer.invoke('data:exportPack', payload),
  importDataPack: () => ipcRenderer.invoke('data:importPack'),
  getCentralConnection: () => ipcRenderer.invoke('central:getConnection'),
  saveCentralConnection: (cfg) => ipcRenderer.invoke('central:saveConnection', cfg),
  testCentralPostgres: (cfg) => ipcRenderer.invoke('central:testPostgres', cfg),
  setZoomFactor: (factor) => {
    const n = Number(factor);
    if (!Number.isFinite(n) || n <= 0) return;
    webFrame.setZoomFactor(Math.min(1.15, Math.max(0.65, n)));
  },
  getZoomFactor: () => webFrame.getZoomFactor(),
};

contextBridge.exposeInMainWorld('ferrogestor', api);
