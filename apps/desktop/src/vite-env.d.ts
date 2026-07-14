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
};

declare global {
  interface Window {
    ferrogestor?: FerroGestorApi;
  }
}

export {};
