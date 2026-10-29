const PREFIX = 'ferrogestor:';

export { PREFIX };

let memoryCache: Record<string, unknown> | null = null;
let initDone = false;

function readLocalStorageAll(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof localStorage === 'undefined') return out;
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (raw != null) {
        const clean = raw.replace(/\0/g, '').trim();
        if (clean) out[k] = JSON.parse(clean) as unknown;
      }
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

function reloadLocalStore(data: Record<string, unknown>): void {
  memoryCache = { ...data };
  if (typeof localStorage !== 'undefined') {
    for (const [full, val] of Object.entries(data)) {
      try {
        localStorage.setItem(full, JSON.stringify(val));
      } catch {
        // localStorage quota — file store is primary
      }
    }
  }
  initDone = true;
}

export async function initLocalStore(): Promise<{
  source: 'file' | 'localStorage' | 'backup' | 'empty';
  totalRecords: number;
}> {
  if (initDone && memoryCache) {
    return { source: 'file', totalRecords: countEntries(memoryCache) };
  }

  if (typeof window !== 'undefined' && window.ferrogestor?.loadDataStore) {
    const { data, stats } = await window.ferrogestor.loadDataStore();
    const total =
      (stats as { total?: number } | undefined)?.total ?? countEntries(data);
    if (total > 0) {
      reloadLocalStore(data);
      return { source: 'file', totalRecords: total };
    }
  }

  const fromLs = readLocalStorageAll();
  const lsTotal = countEntries(fromLs);
  if (lsTotal > 0) {
    if (typeof window !== 'undefined' && window.ferrogestor?.importAllData) {
      await window.ferrogestor.importAllData(fromLs);
    }
    reloadLocalStore(fromLs);
    return { source: 'localStorage', totalRecords: lsTotal };
  }

  memoryCache = {};
  initDone = true;
  return { source: 'empty', totalRecords: 0 };
}

export function loadJson<T>(key: string, fallback: T): T {
  const full = PREFIX + key;
  if (memoryCache && full in memoryCache) {
    return memoryCache[full] as T;
  }
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(full);
    if (!raw) return fallback;
    const clean = raw.replace(/\0/g, '').trim();
    if (!clean) return fallback;
    const parsed = JSON.parse(clean) as T;
    if (!memoryCache) memoryCache = {};
    memoryCache[full] = parsed as unknown;
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  const full = PREFIX + key;
  if (!memoryCache) memoryCache = {};

  // Se for primitivo estritamente igual, não precisa regravar
  const prev = memoryCache[full];
  if (prev !== undefined && typeof value !== 'object' && prev === value) {
    return;
  }

  memoryCache[full] = value as unknown;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(full, JSON.stringify(value));
    } catch {
      // file store is primary in Electron
    }
  }

  if (typeof window !== 'undefined' && window.ferrogestor?.persistData) {
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

  let version = input.version;
  if (version === undefined) {
    if (input.action === 'CREATE') {
      version = 1;
    } else {
      const fromPayload = Number(input.payload.version);
      version =
        Number.isFinite(fromPayload) && fromPayload > 0 ? fromPayload + 1 : 2;
    }
  }

  const op = {
    originOperationId: newId(),
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: { ...input.payload, version },
    version,
    companyId: session.companyId,
    branchId: session.branchId,
    deviceId: session.deviceId,
    userId: session.userId,
    occurredAt: new Date().toISOString(),
    status: 'PENDING' as const,
  };

  if (typeof window !== 'undefined' && window.ferrogestor?.enqueueSync) {
    try {
      const res = await window.ferrogestor.enqueueSync(op);
      if (res && typeof res === 'object' && 'ok' in res && !(res as { ok: boolean }).ok) {
        console.warn('[sync] enqueueSync retornou erro, salvando na fila local:', res);
        const pending = loadJson<unknown[]>('offline-sync-queue', []);
        pending.push(op);
        saveJson('offline-sync-queue', pending);
      }
    } catch (err) {
      console.warn('[sync] Falha ao comunicar com IPC de sync (salvando offline):', err);
      const pending = loadJson<unknown[]>('offline-sync-queue', []);
      pending.push(op);
      saveJson('offline-sync-queue', pending);
    }
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
  if (typeof window !== 'undefined' && window.ferrogestor?.importAllData && total > 0) {
    await window.ferrogestor.importAllData(fromLs);
  }
  reloadLocalStore(fromLs);
  return total;
}

/** Reseta o cache em memória após wipe local. */
export function resetMemoryStore(preserved?: Record<string, unknown>): void {
  memoryCache = preserved ? { ...preserved } : {};
  initDone = true;
}
