type FerroGestorApi = {
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
};

declare global {
  interface Window {
    ferrogestor?: FerroGestorApi;
  }
}

export {};
