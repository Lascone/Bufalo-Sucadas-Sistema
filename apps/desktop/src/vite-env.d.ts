type DataDiagnostic = {
  userDataDir: string;
  dataDir: string;
  backupDir: string;
  storePath: string;
  dbPath: string;
  mediaDir: string;
  exportsDir: string;
  levelDbDir: string;
  currentStats: {
    counts: Record<string, number>;
    total: number;
    storePath: string;
    sizeBytes: number;
  };
  dataBackups: Array<{
    name: string;
    path: string;
    size: number;
    totalRecords: number;
  }>;
  dbBackups: Array<{ name: string; path: string; size: number }>;
  candidates: Array<{
    id: string;
    label: string;
    userDataDir: string;
    kind: string;
    path: string;
    exists: boolean;
    sizeBytes: number;
    totalRecords: number;
    modifiedAt: string | null;
    hint: string;
  }>;
  warnings: string[];
  tips: string[];
};

type FerroGestorApi = {
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
  runDataDiagnostic: () => Promise<DataDiagnostic>;
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

declare global {
  interface Window {
    ferrogestor?: FerroGestorApi;
  }
}

export {};
