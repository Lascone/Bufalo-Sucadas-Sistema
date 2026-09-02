import { create } from 'zustand';
import { APP_COMPANY, APP_NAME, APP_VERSION } from '@ferrogestor/shared';
import {
  getOperator,
  loadActiveOperatorId,
  persistOperatorId,
} from '../lib/operators';
import { saveJson } from '../lib/local-store';
import { applyRemoteOperationsAsync, type RemoteSyncOp } from '../lib/sync-apply';

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
  lastPullOperations?: RemoteSyncOp[];
  skipped?: boolean;
  reason?: string;
};

type AppState = {
  theme: 'light' | 'dark';
  appInfo: { version: string; name: string; company: string; dbPath?: string } | null;
  session: {
    username: string;
    operatorId: string | null;
    branchName: string;
    deviceName: string;
  };
  sync: SyncSnapshot;
  syncBusy: boolean;
  syncProgress: { done: number; total: number; label: string } | null;
  toggleTheme: () => void;
  setOperator: (operatorId: string) => void;
  clearOperator: () => void;
  loadAppInfo: () => Promise<void>;
  refreshSync: () => Promise<void>;
  runSyncNow: () => Promise<void>;
  importFromDevice: (
    deviceId: string,
    onProgress?: (p: {
      done: number;
      total: number;
      applied: number;
      skipped: number;
    }) => void,
  ) => Promise<
    | { ok: true; count: number; applied: number; skipped: number }
    | { ok: false; error: string }
  >;
  connectSyncServer: (input?: {
    deviceName?: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
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

function sessionFromStored() {
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_BUFALO_KEEP_SESSION !== '1' &&
    typeof sessionStorage !== 'undefined'
  ) {
    if (sessionStorage.getItem('bufalo-dev-window') !== '1') {
      sessionStorage.setItem('bufalo-dev-window', '1');
      persistOperatorId(null);
      return {
        username: '',
        operatorId: null,
        branchName: 'Matriz',
        deviceName: 'Escritório',
      };
    }
  }

  const id = loadActiveOperatorId();
  const op = getOperator(id);
  return {
    username: op?.name ?? '',
    operatorId: op?.id ?? null,
    branchName: 'Matriz',
    deviceName: 'Escritório',
  };
}

async function syncSessionFromAuth() {
  if (!window.ferrogestor?.getSyncSessionIds) return;
  const ids = await window.ferrogestor.getSyncSessionIds();
  if (!ids.companyId || !ids.userId) return;
  saveJson('session', {
    companyId: ids.companyId,
    branchId: ids.branchId ?? '00000000-0000-4000-8000-000000000011',
    deviceId: ids.deviceId,
    userId: ids.userId,
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'dark',
  appInfo: { version: APP_VERSION, name: APP_NAME, company: APP_COMPANY },
  session: sessionFromStored(),
  sync: emptySync,
  syncBusy: false,
  syncProgress: null,
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setOperator: (operatorId) => {
    const op = getOperator(operatorId);
    if (!op) return;
    persistOperatorId(op.id);
    set((s) => ({
      session: {
        ...s.session,
        username: op.name,
        operatorId: op.id,
      },
    }));
  },
  clearOperator: () => {
    persistOperatorId(null);
    set((s) => ({
      session: {
        ...s.session,
        username: '',
        operatorId: null,
      },
    }));
  },
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
    if (get().syncBusy) return;
    set({
      syncBusy: true,
      syncProgress: { done: 0, total: 0, label: 'Sincronizando…' },
    });
    try {
      await syncSessionFromAuth();
      const { getSettings } = await import('../lib/settings');
      const settings = getSettings();
      const snap = (await window.ferrogestor.runSyncNow({
        preferLocal: settings['sync.preferLocal'] !== false,
        batchSize: 40,
      })) as SyncSnapshot;
      const ops = snap.lastPullOperations ?? [];
      if (ops.length) {
        set({
          syncProgress: {
            done: 0,
            total: ops.length,
            label: 'Aplicando dados do servidor…',
          },
        });
        await applyRemoteOperationsAsync(ops, {
          chunkSize: 40,
          onProgress: (p) =>
            set({
              syncProgress: {
                done: p.done,
                total: p.total,
                label: `Aplicando… ${p.done}/${p.total}`,
              },
            }),
        });
      }
      set({ sync: { ...emptySync, ...snap } });
      await get().refreshSync();
    } finally {
      set({ syncBusy: false, syncProgress: null });
    }
  },
  importFromDevice: async (deviceId, onProgress) => {
    if (!window.ferrogestor?.importFromDevice) {
      return { ok: false as const, error: 'Indisponível fora do Electron' };
    }
    if (get().syncBusy) {
      return {
        ok: false as const,
        error: 'Aguarde a sincronização/importação em andamento.',
      };
    }
    set({
      syncBusy: true,
      syncProgress: { done: 0, total: 0, label: 'Baixando do servidor…' },
    });
    try {
      const res = await window.ferrogestor.importFromDevice(deviceId);
      if (!res.ok) return res;
      set({
        syncProgress: {
          done: 0,
          total: res.operations.length,
          label: 'Importando…',
        },
      });
      const result = await applyRemoteOperationsAsync(res.operations, {
        chunkSize: 40,
        importMode: true,
        onProgress: (p) => {
          onProgress?.(p);
          set({
            syncProgress: {
              done: p.done,
              total: p.total,
              label: `Importando… ${p.done}/${p.total}`,
            },
          });
        },
      });
      return {
        ok: true as const,
        count: res.count,
        applied: result.applied,
        skipped: result.skipped,
      };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      set({ syncBusy: false, syncProgress: null });
    }
  },
  connectSyncServer: async (input) => {
    if (!window.ferrogestor?.loginSync) {
      return {
        ok: false,
        error: 'Conexão central indisponível (rode no app Electron)',
      };
    }
    const result = await window.ferrogestor.loginSync(input ?? {});
    if (!result.ok) return result;
    await syncSessionFromAuth();
    return { ok: true };
  },
}));
