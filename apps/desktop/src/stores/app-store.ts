import { create } from 'zustand';
import { APP_COMPANY, APP_NAME, APP_VERSION } from '@ferrogestor/shared';

type SyncSnapshot = {
  online: boolean | null;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingCount: number;
  errorCount: number;
  conflictCount: number;
  history: Array<{
    at: string;
    pushed: number;
    pulled: number;
    conflicts: number;
    errors: number;
    success: boolean;
  }>;
  pending?: unknown[];
};

type AppState = {
  theme: 'light' | 'dark';
  appInfo: { version: string; name: string; company: string; dbPath?: string } | null;
  session: {
    username: string;
    branchName: string;
    deviceName: string;
  };
  sync: SyncSnapshot;
  toggleTheme: () => void;
  loadAppInfo: () => Promise<void>;
  refreshSync: () => Promise<void>;
  runSyncNow: () => Promise<void>;
};

const emptySync: SyncSnapshot = {
  online: null,
  lastSyncAt: null,
  lastError: null,
  pendingCount: 0,
  errorCount: 0,
  conflictCount: 0,
  history: [],
};

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'light',
  appInfo: { version: APP_VERSION, name: APP_NAME, company: APP_COMPANY },
  session: {
    username: 'admin',
    branchName: 'Matriz',
    deviceName: 'Escritório',
  },
  sync: emptySync,
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  loadAppInfo: async () => {
    if (window.ferrogestor) {
      const info = await window.ferrogestor.getAppInfo();
      set({
        appInfo: {
          version: info.version,
          name: info.name,
          company: info.company,
          dbPath: info.dbPath,
        },
      });
    }
  },
  refreshSync: async () => {
    if (!window.ferrogestor) return;
    const snap = (await window.ferrogestor.getSyncSnapshot()) as SyncSnapshot;
    set({ sync: { ...emptySync, ...snap } });
  },
  runSyncNow: async () => {
    if (!window.ferrogestor) return;
    const snap = (await window.ferrogestor.runSyncNow()) as SyncSnapshot;
    set({ sync: { ...emptySync, ...snap } });
    await get().refreshSync();
  },
}));
