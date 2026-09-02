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
  operatorReady: boolean;
  serverLoggedIn: boolean;
  appInfo: { version: string; name: string; company: string; dbPath?: string; dataPath?: string } | null;
  session: {
    username: string;
    branchName: string;
    deviceName: string;
  };
  serverSession: {
    username: string;
    deviceName: string;
  } | null;
  sync: SyncSnapshot;
  dataRevision: number;
  toggleTheme: () => void;
  loadAppInfo: () => Promise<void>;
  selectOperator: (name: string) => void;
  loadSession: () => Promise<void>;
  loginServer: (input: {
    apiBaseUrl: string;
    username: string;
    password: string;
    deviceName: string;
  }) => Promise<void>;
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
  operatorReady: false,
  serverLoggedIn: false,
  appInfo: { version: APP_VERSION, name: APP_NAME, company: APP_COMPANY },
  session: {
    username: '',
    branchName: 'Matriz',
    deviceName: 'Escritório',
  },
  serverSession: null,
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
  selectOperator: (name) => {
    const trimmed = name.trim();
    saveJson('local-operator', { username: trimmed });
    set({
      operatorReady: true,
      session: {
        username: trimmed,
        branchName: 'Matriz',
        deviceName: 'Escritório',
      },
    });
  },
  loadSession: async () => {
    if (!window.ferrogestor?.getSession) {
      set({ serverLoggedIn: false, serverSession: null });
      return;
    }
    const s = await window.ferrogestor.getSession();
    if (!s) {
      set({ serverLoggedIn: false, serverSession: null });
      await get().refreshSync();
      return;
    }
    saveJson('session', {
      companyId: s.user.companyId,
      branchId: s.user.branchId ?? '00000000-0000-4000-8000-000000000011',
      deviceId: s.deviceId ?? '00000000-0000-4000-8000-000000000012',
      userId: s.user.id,
    });
    set({
      serverLoggedIn: true,
      serverSession: {
        username: s.user.username,
        deviceName: s.deviceName ?? 'PC',
      },
    });
    await get().refreshSync();
  },
  loginServer: async (input) => {
    if (!window.ferrogestor?.login) {
      throw new Error('Login ao servidor disponível apenas no app instalado.');
    }
    await window.ferrogestor.login(input);
    await get().loadSession();
  },
  logout: async () => {
    await window.ferrogestor?.logout?.();
    set({
      serverLoggedIn: false,
      serverSession: null,
      sync: emptySync,
    });
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
