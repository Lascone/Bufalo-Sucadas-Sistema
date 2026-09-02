/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUFALO_KEEP_SESSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type CentralConnectionDto = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  deviceName?: string;
};

type FerroGestorApi = {
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
  setZoomFactor: (factor: number) => void;
  getZoomFactor: () => number;
  getCentralConnection: () => Promise<CentralConnectionDto>;
  saveCentralConnection: (cfg: CentralConnectionDto) => Promise<{
    connection: CentralConnectionDto;
    connect: { ok: true; status: unknown } | { ok: false; error: string };
  }>;
  testCentralPostgres: (
    cfg?: CentralConnectionDto,
  ) => Promise<{ ok: true; detail: string } | { ok: false; error: string }>;
};

declare global {
  interface Window {
    ferrogestor?: FerroGestorApi;
  }
}

export {};
