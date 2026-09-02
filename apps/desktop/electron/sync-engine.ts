import fs from 'node:fs';
import path from 'node:path';
import { applyRemoteOperations } from './remote-apply';
import {
  getAccessToken,
  getApiBaseUrl,
  getDeviceId,
  loadSession,
  refreshAccessToken,
  saveSession,
} from './session-store';
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

type RemoteOp = {
  originOperationId: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  payload: Record<string, unknown>;
  deviceId?: string;
  occurredAt?: string;
};

type SyncStoreFile = {
  pending: LocalSyncOp[];
  lastSyncAt: string | null;
  lastError: string | null;
  online: boolean | null;
  lastPullAt: string | null;
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
      lastPullAt: null,
      history: [],
    };
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as SyncStoreFile;
  return { ...raw, lastPullAt: raw.lastPullAt ?? null };
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
    lastPullAt: store.lastPullAt,
    pendingCount: store.pending.filter((o) => o.status === 'PENDING' || o.status === 'ERROR').length,
    errorCount: store.pending.filter((o) => o.status === 'ERROR').length,
    conflictCount: store.pending.filter((o) => o.status === 'CONFLICT').length,
    history: store.history.slice(0, 20),
    pending: store.pending.slice(0, 50),
    mode: 'realtime' as const,
  };
}

export function enqueueSyncOp(op: LocalSyncOp) {
  const store = readStore();
  store.pending.push({ ...op, status: op.status ?? 'PENDING' });
  writeStore(store);
  return { ok: true, pendingCount: store.pending.length };
}

async function pushToServer(batch: LocalSyncOp[]) {
  const token = getAccessToken();
  const deviceId = getDeviceId() ?? batch[0]?.deviceId;
  if (!token) {
    return { skipped: true as const, reason: 'no-token' as const };
  }
  if (!deviceId) {
    return { skipped: true as const, reason: 'no-device' as const };
  }

  const apiBase = getApiBaseUrl();
  const body = {
    deviceId,
    operations: batch.map(({ status: _s, lastError: _e, ...op }) => op),
  };

  let res = await fetch(`${apiBase}/realtime/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(`${apiBase}/realtime/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshed}`,
        },
        body: JSON.stringify(body),
      });
    }
  }

  if (!res.ok) {
    throw new Error(`Servidor respondeu ${res.status}`);
  }

  return (await res.json()) as {
    accepted?: string[];
    conflicts?: Array<{ originOperationId: string }>;
    errors?: Array<{ originOperationId: string; message: string }>;
  };
}

async function pullFromServer(since: string, deviceId: string) {
  const token = getAccessToken();
  if (!token) return { operations: [] as RemoteOp[], serverTime: null as string | null };

  const apiBase = getApiBaseUrl();
  let res = await fetch(
    `${apiBase}/realtime/changes?since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(deviceId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(
        `${apiBase}/realtime/changes?since=${encodeURIComponent(since)}&deviceId=${encodeURIComponent(deviceId)}`,
        { headers: { Authorization: `Bearer ${refreshed}` } },
      );
    }
  }

  if (!res.ok) return { operations: [] as RemoteOp[], serverTime: null };
  const body = (await res.json()) as { operations?: RemoteOp[]; serverTime?: string };
  return { operations: body.operations ?? [], serverTime: body.serverTime ?? null };
}

export type SyncSnapshot = ReturnType<typeof getSyncSnapshot>;

export type SyncCycleResult = SyncSnapshot & {
  remoteApplied?: number;
  skipped?: boolean;
  reason?: string;
};

export async function runSyncCycle(): Promise<SyncCycleResult> {
  const store = readStore();
  const apiBase = getApiBaseUrl();
  const session = loadSession();

  let online = false;
  try {
    const health = await fetch(`${apiBase}/health`);
    online = health.ok;
  } catch {
    online = false;
  }
  store.online = online;

  if (!online) {
    store.lastError = 'Servidor indisponível — dados ficam na fila local';
    writeStore(store);
    return getSyncSnapshot();
  }

  const token = getAccessToken();
  if (!token) {
    store.lastError = 'Faça login para enviar ao banco de dados';
    writeStore(store);
    return { ...getSyncSnapshot(), skipped: true, reason: 'no-token' };
  }

  const batch = store.pending
    .filter((o) => o.status === 'PENDING' || o.status === 'ERROR')
    .slice(0, 50);

  let pushed = 0;
  let conflicts = 0;
  let errors = 0;

  if (batch.length > 0) {
    batch.forEach((o) => {
      o.status = 'SYNCING';
    });
    writeStore(store);

    try {
      const body = await pushToServer(batch);
      if ('skipped' in body) {
        store.lastError = 'Login necessário';
        writeStore(store);
        return { ...getSyncSnapshot(), ...body };
      }

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
        } else if (op.status === 'SYNCING') {
          op.status = 'PENDING';
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
  let remoteApplied = 0;
  const deviceId = getDeviceId() ?? session?.deviceId ?? batch[0]?.deviceId ?? '';
  if (deviceId) {
    try {
      const since =
        store.lastPullAt ??
        session?.lastPullAt ??
        store.lastSyncAt ??
        new Date(0).toISOString();
      const pullBody = await pullFromServer(since, deviceId);
      pulled = pullBody.operations.length;
      if (pulled > 0) {
        remoteApplied = applyRemoteOperations(pullBody.operations);
        const nextPullAt =
          pullBody.serverTime ??
          pullBody.operations[pullBody.operations.length - 1]?.occurredAt ??
          new Date().toISOString();
        store.lastPullAt = nextPullAt;
        const currentSession = loadSession();
        if (currentSession) {
          saveSession({ ...currentSession, lastPullAt: nextPullAt });
        }
      }
    } catch {
      // pull opcional
    }
  }

  store.lastSyncAt = new Date().toISOString();
  store.lastError = errors > 0 ? 'Há operações com erro na fila' : null;
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

  return { ...getSyncSnapshot(), remoteApplied };
}
