const PREFIX = 'ferrogestor:';

export { PREFIX };

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

function reloadLocalStore(data: Record<string, unknown>): void {
  memoryCache = { ...data };
  for (const [full, val] of Object.entries(data)) {
    try {
      localStorage.setItem(full, JSON.stringify(val));
    } catch {
      // localStorage quota — file store is primary
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

  if (window.ferrogestor?.loadDataStore) {
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
    if (window.ferrogestor?.importAllData) {
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
  try {
    const raw = localStorage.getItem(full);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
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

  // Se o valor for estritamente igual ao cache atual, não redispara persistência nem I/O
  const prev = memoryCache[full];
  if (prev !== undefined) {
    if (prev === value) return;
    try {
      if (JSON.stringify(prev) === JSON.stringify(value)) return;
    } catch {
      // continua se JSON.stringify falhar por algum motivo
    }
  }

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
