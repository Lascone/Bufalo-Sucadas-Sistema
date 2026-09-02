const PREFIX = 'ferrogestor:';

export const LOCAL_DATA_KEYS = [
  'sales',
  'settings',
  'settings-entity-id',
  'contacts',
  'materials',
  'material-photos',
  'patio-movements',
  'finance-days',
  'purchases',
  'cash-registers',
  'session',
  'offline-sync-queue',
] as const;

let memoryCache: Record<string, unknown> | null = null;
let initDone = false;

function readLocalStorageAll(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (raw != null) out[k] = JSON.parse(raw) as unknown;
    } catch {
      // skip corrupted key
    }
  }
  return out;
}

function countEntries(data: Record<string, unknown>): number {
  let total = 0;
  for (const val of Object.values(data)) {
    if (Array.isArray(val)) total += val.length;
    else if (val && typeof val === 'object') total += Object.keys(val).length;
    else if (val != null) total += 1;
  }
  return total;
}

function syncToLocalStorage(data: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(data)) {
    if (!k.startsWith(PREFIX)) continue;
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      // quota — file store is primary
    }
  }
}

/** Carrega dados do disco (Electron) ou localStorage. Chamar uma vez antes da UI. */
export async function initLocalStore(): Promise<{
  source: 'file' | 'localStorage' | 'backup' | 'empty';
  totalRecords: number;
}> {
  if (initDone && memoryCache) {
    return { source: 'file', totalRecords: countEntries(memoryCache) };
  }

  if (window.ferrogestor?.loadDataStore) {
    const loaded = await window.ferrogestor.loadDataStore();
    memoryCache = loaded.data ?? {};
    let total = countEntries(memoryCache);

    if (total === 0) {
      const fromLs = readLocalStorageAll();
      const lsTotal = countEntries(fromLs);
      if (lsTotal > 0) {
        await window.ferrogestor.importAllData(fromLs);
        memoryCache = { ...fromLs };
        initDone = true;
        return { source: 'localStorage', totalRecords: lsTotal };
      }
    }

    syncToLocalStorage(memoryCache);
    initDone = true;
    return { source: total > 0 ? 'file' : 'empty', totalRecords: total };
  }

  memoryCache = readLocalStorageAll();
  initDone = true;
  return {
    source: countEntries(memoryCache) > 0 ? 'localStorage' : 'empty',
    totalRecords: countEntries(memoryCache),
  };
}

export function reloadLocalStore(data: Record<string, unknown>): void {
  memoryCache = { ...data };
  syncToLocalStorage(memoryCache);
}

export function loadJson<T>(key: string, fallback: T): T {
  const full = PREFIX + key;
  if (memoryCache && full in memoryCache) {
    return memoryCache[full] as T;
  }
  try {
    const raw = localStorage.getItem(full);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  const full = PREFIX + key;
  if (!memoryCache) memoryCache = {};
  memoryCache[full] = value as unknown;

  try {
    localStorage.setItem(full, JSON.stringify(value));
  } catch {
    // file store is primary in Electron
  }

  if (window.ferrogestor?.persistData) {
    void window.ferrogestor.persistData({ [full]: value as unknown });
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function enqueueSyncOp(input: {
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  payload: Record<string, unknown>;
  version?: number;
}) {
  const session = loadJson('session', {
    companyId: '00000000-0000-4000-8000-000000000010',
    branchId: '00000000-0000-4000-8000-000000000011',
    deviceId: '00000000-0000-4000-8000-000000000012',
    userId: '00000000-0000-4000-8000-000000000013',
  });

  const op = {
    originOperationId: newId(),
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: input.payload,
    version: input.version ?? 1,
    companyId: session.companyId,
    branchId: session.branchId,
    deviceId: session.deviceId,
    userId: session.userId,
    occurredAt: new Date().toISOString(),
    status: 'PENDING' as const,
  };

  if (window.ferrogestor?.enqueueSync) {
    await window.ferrogestor.enqueueSync(op);
  } else {
    const pending = loadJson<unknown[]>('offline-sync-queue', []);
    pending.push(op);
    saveJson('offline-sync-queue', pending);
  }
}

/** Recarrega do disco após pull remoto (outro PC). */
export async function reloadFromDisk(): Promise<number> {
  initDone = false;
  memoryCache = null;
  const result = await initLocalStore();
  return result.totalRecords;
}

/** Importa tudo do localStorage para o arquivo no disco (recuperação manual). */
export async function importFromLocalStorage(): Promise<number> {
  const fromLs = readLocalStorageAll();
  const total = countEntries(fromLs);
  if (window.ferrogestor?.importAllData && total > 0) {
    await window.ferrogestor.importAllData(fromLs);
  }
  reloadLocalStore(fromLs);
  return total;
}
