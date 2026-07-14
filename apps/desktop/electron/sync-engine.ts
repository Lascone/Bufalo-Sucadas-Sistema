import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from './local-db';

export type LocalSyncOp = {
  originOperationId: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  payload: Record<string, unknown>;
  version: number;
  companyId: string;
  branchId?: string | null;
  deviceId: string;
  userId: string;
  occurredAt: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'ERROR' | 'CANCELLED';
  lastError?: string;
};

type SyncStoreFile = {
  pending: LocalSyncOp[];
  lastSyncAt: string | null;
  lastError: string | null;
  online: boolean | null;
  history: Array<{
    at: string;
    pushed: number;
    pulled: number;
    conflicts: number;
    errors: number;
    success: boolean;
  }>;
};

function storePath(): string {
  return path.join(getDataDir(), 'sync-queue.json');
}

function readStore(): SyncStoreFile {
  const p = storePath();
  if (!fs.existsSync(p)) {
    return {
      pending: [],
      lastSyncAt: null,
      lastError: null,
      online: null,
      history: [],
    };
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as SyncStoreFile;
}

function writeStore(store: SyncStoreFile): void {
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf8');
}

export function getSyncSnapshot() {
  const store = readStore();
  return {
    online: store.online,
    lastSyncAt: store.lastSyncAt,
    lastError: store.lastError,
    pendingCount: store.pending.filter((o) => o.status === 'PENDING' || o.status === 'ERROR').length,
    errorCount: store.pending.filter((o) => o.status === 'ERROR').length,
    conflictCount: store.pending.filter((o) => o.status === 'CONFLICT').length,
    history: store.history.slice(0, 20),
    pending: store.pending.slice(0, 50),
  };
}

export function enqueueSyncOp(op: LocalSyncOp) {
  const store = readStore();
  store.pending.push({ ...op, status: op.status ?? 'PENDING' });
  writeStore(store);
  return { ok: true, pendingCount: store.pending.length };
}

export async function runSyncCycle() {
  const store = readStore();
  const apiBase = process.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

  let online = false;
  try {
    const health = await fetch(`${apiBase}/health`);
    online = health.ok;
  } catch {
    online = false;
  }
  store.online = online;

  if (!online) {
    store.lastError = 'Servidor indisponível';
    writeStore(store);
    return getSyncSnapshot();
  }

  const token = process.env.FERROGESTOR_ACCESS_TOKEN;
  if (!token) {
    store.lastError = 'Sem token de sessão — faça login para sincronizar';
    writeStore(store);
    return {
      ...getSyncSnapshot(),
      skipped: true,
      reason: 'no-token',
    };
  }

  const batch = store.pending
    .filter((o) => o.status === 'PENDING' || o.status === 'ERROR')
    .slice(0, 100);

  let pushed = 0;
  let conflicts = 0;
  let errors = 0;

  if (batch.length > 0) {
    batch.forEach((o) => {
      o.status = 'SYNCING';
    });
    writeStore(store);

    try {
      const res = await fetch(`${apiBase}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: batch[0]?.deviceId,
          operations: batch.map(({ status: _s, lastError: _e, ...op }) => op),
        }),
      });
      const body = (await res.json()) as {
        accepted?: string[];
        conflicts?: Array<{ originOperationId: string }>;
        errors?: Array<{ originOperationId: string; message: string }>;
      };

      const accepted = new Set(body.accepted ?? []);
      const conflictIds = new Set((body.conflicts ?? []).map((c) => c.originOperationId));
      const errorMap = new Map(
        (body.errors ?? []).map((e) => [e.originOperationId, e.message]),
      );

      for (const op of store.pending) {
        if (accepted.has(op.originOperationId)) {
          op.status = 'SYNCED';
          pushed += 1;
        } else if (conflictIds.has(op.originOperationId)) {
          op.status = 'CONFLICT';
          conflicts += 1;
        } else if (errorMap.has(op.originOperationId)) {
          op.status = 'ERROR';
          op.lastError = errorMap.get(op.originOperationId);
          errors += 1;
        }
      }
    } catch (err) {
      errors = batch.length;
      batch.forEach((o) => {
        o.status = 'ERROR';
        o.lastError = err instanceof Error ? err.message : String(err);
      });
    }
  }

  let pulled = 0;
  try {
    const since = store.lastSyncAt ?? new Date(0).toISOString();
    const deviceId = batch[0]?.deviceId ?? process.env.FERROGESTOR_DEVICE_ID ?? '';
    if (deviceId) {
      const pullRes = await fetch(
        `${apiBase}/sync/pull?since=${encodeURIComponent(since)}&deviceId=${deviceId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (pullRes.ok) {
        const pullBody = (await pullRes.json()) as { operations?: unknown[] };
        pulled = pullBody.operations?.length ?? 0;
      }
    }
  } catch {
    // pull opcional no ciclo; erros registrados abaixo
  }

  store.lastSyncAt = new Date().toISOString();
  store.lastError = errors > 0 ? 'Há operações com erro' : null;
  store.history.unshift({
    at: store.lastSyncAt,
    pushed,
    pulled,
    conflicts,
    errors,
    success: errors === 0,
  });
  store.history = store.history.slice(0, 50);
  store.pending = store.pending.filter((o) => o.status !== 'SYNCED');
  writeStore(store);

  return getSyncSnapshot();
}
