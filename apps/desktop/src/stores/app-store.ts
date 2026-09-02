import { create } from 'zustand';
import { APP_COMPANY, APP_NAME, APP_VERSION } from '@ferrogestor/shared';
import { reloadFromDisk, saveJson } from '../lib/local-store';

type SyncSnapshot = {
  online: boolean | null;
  lastSyncAt: string | null;
  lastPullAt?: string | null;
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
  mode?: string;
};

type AppState = {
  theme: 'light' | 'dark';
  authenticated: boolean;
  authChecked: boolean;
  appInfo: { version: string; name: string; company: string; dbPath?: string; dataPath?: string } | null;
  session: {
    username: string;
    branchName: string;
    deviceName: string;
  };
  sync: SyncSnapshot;
  dataRevision: number;
  toggleTheme: () => void;
  loadAppInfo: () => Promise<void>;
  loadSession: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSync: () => Promise<void>;
  runSyncNow: () => Promise<void>;
  applyRemoteChanges: () => Promise<void>;
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
  theme: 'dark',
  authenticated: false,
  authChecked: false,
  appInfo: { version: APP_VERSION, name: APP_NAME, company: APP_COMPANY },
  session: {
    username: '—',
    branchName: 'Matriz',
    deviceName: '—',
  },
  sync: emptySync,
  dataRevision: 0,
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  loadAppInfo: async () => {
    if (window.ferrogestor) {
      const info = await window.ferrogestor.getAppInfo();
      set({
        appInfo: {
          version: info.version,
          name: info.name,
          company: info.company,
          dbPath: info.dbPath,
          dataPath: info.dataPath,
        },
      });
    }
  },
  loadSession: async () => {
    if (!window.ferrogestor?.getSession) {
      set({ authChecked: true, authenticated: true });
      return;
    }
    const s = await window.ferrogestor.getSession();
    if (!s) {
      set({ authChecked: true, authenticated: false });
      return;
    }
    saveJson('session', {
      companyId: s.user.companyId,
      branchId: s.user.branchId ?? '00000000-0000-4000-8000-000000000011',
      deviceId: s.deviceId ?? '00000000-0000-4000-8000-000000000012',
      userId: s.user.id,
    });
    set({
      authChecked: true,
      authenticated: true,
      session: {
        username: s.user.username,
        branchName: 'Matriz',
        deviceName: s.deviceName ?? 'PC',
      },
    });
    await get().refreshSync();
  },
  logout: async () => {
    await window.ferrogestor?.logout?.();
    set({ authenticated: false, sync: emptySync });
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
  },
  applyRemoteChanges: async () => {
    await reloadFromDisk();
    set((s) => ({ dataRevision: s.dataRevision + 1 }));
  },
}));
