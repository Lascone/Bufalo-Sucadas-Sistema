import fs from 'node:fs';
import path from 'node:path';
import type { SyncOperation } from '@ferrogestor/shared';
import { getDataDir } from './local-db';
import { getConfiguredDatabaseUrl } from './central-connection';
import { getCentralPrisma, getSyncCore } from './central-db';
import {
  connectCentral,
  getSyncAuthStatus,
  getSyncSessionIds,
  readSyncAuth,
} from './sync-auth';

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

export type PullOperation = {
  originOperationId: string;
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  version: number;
  occurredAt: string;
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
  lastPullOperations?: PullOperation[];
};

function storePath(): string {
  return path.join(getDataDir(), 'sync-queue.json');
}

function defaultStore(): SyncStoreFile {
  return {
    pending: [],
    lastSyncAt: null,
    lastError: null,
    online: null,
    lastPullAt: null,
    history: [],
    lastPullOperations: [],
  };
}

function readStore(): SyncStoreFile {
  const p = storePath();
  if (!fs.existsSync(p)) {
    return defaultStore();
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    // Remove qualquer byte nulo ou caractere NUL gerado em travamentos abruptos do Windows/NTFS
    const clean = raw.replace(/\0/g, '').trim();
    if (!clean) {
      console.warn('[sync-engine] sync-queue.json estava vazio ou continha apenas bytes nulos. Restaurando fila limpa.');
      const base = defaultStore();
      writeStore(base);
      return base;
    }
    const parsed = JSON.parse(clean) as SyncStoreFile;
    return {
      pending: Array.isArray(parsed?.pending) ? parsed.pending : [],
      lastSyncAt: parsed?.lastSyncAt ?? null,
      lastError: parsed?.lastError ?? null,
      online: parsed?.online ?? null,
      lastPullAt: parsed?.lastPullAt ?? null,
      history: Array.isArray(parsed?.history) ? parsed.history : [],
      lastPullOperations: Array.isArray(parsed?.lastPullOperations) ? parsed.lastPullOperations : [],
    };
  } catch (err) {
    console.error('[sync-engine] Falha ao processar sync-queue.json corrompido, reparando automaticamente:', err);
    try {
      const corruptBackup = p + `.corrupted-${Date.now()}`;
      fs.copyFileSync(p, corruptBackup);
    } catch {
      // ignore
    }
    const base = defaultStore();
    writeStore(base);
    return base;
  }
}

function writeStore(store: SyncStoreFile): void {
  const target = storePath();
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = target + '.tmp';
  const content = JSON.stringify(store, null, 2);

  try {
    fs.writeFileSync(tmp, content, 'utf8');
    let renamed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(tmp, target);
        renamed = true;
        break;
      } catch (err) {
        if (attempt === 4) {
          try {
            fs.copyFileSync(tmp, target);
            fs.unlinkSync(tmp);
            renamed = true;
          } catch (copyErr) {
            console.error('[sync-engine] Erro crítico ao gravar sync-queue no disco:', copyErr);
          }
        } else {
          const start = Date.now();
          while (Date.now() - start < 30) {
            /* spin wait 30ms */
          }
        }
      }
    }
  } catch (err) {
    console.error('[sync-engine] Falha ao gravar sync-queue:', err);
    try {
      fs.writeFileSync(target, content, 'utf8');
    } catch {
      // ignore
    }
  }
}

export function getSyncSnapshot() {
  try {
    const store = readStore();
    return {
      online: store.online,
      lastSyncAt: store.lastSyncAt,
      lastError: store.lastError,
      pendingCount: (store.pending ?? []).filter(
        (o) => o.status === 'PENDING' || o.status === 'ERROR' || o.status === 'SYNCING',
      ).length,
      errorCount: (store.pending ?? []).filter((o) => o.status === 'ERROR').length,
      conflictCount: (store.pending ?? []).filter((o) => o.status === 'CONFLICT').length,
      history: store.history ?? [],
      pending: store.pending ?? [],
      lastPullOperations: store.lastPullOperations ?? [],
    };
  } catch (err) {
    console.error('[sync-engine] Erro ao obter getSyncSnapshot:', err);
    return {
      online: false,
      lastSyncAt: null,
      lastError: String(err),
      pendingCount: 0,
      errorCount: 0,
      conflictCount: 0,
      history: [],
      pending: [],
      lastPullOperations: [],
    };
  }
}

export function enqueueSyncOp(op: Omit<LocalSyncOp, 'status'> & { status?: LocalSyncOp['status'] }) {
  try {
    const store = readStore();
    const ids = getSyncSessionIds();
    const patched: LocalSyncOp = {
      ...op,
      status: op.status ?? 'PENDING',
      companyId: ids.companyId ?? op.companyId,
      branchId: ids.branchId ?? op.branchId,
      deviceId: ids.deviceId || op.deviceId,
      userId: ids.userId ?? op.userId,
    };
    store.pending.push(patched);
    writeStore(store);
    return { ok: true, pendingCount: store.pending.length };
  } catch (err) {
    console.error('[sync-engine] Falha ao enfileirar operação de sync:', err);
    return { ok: false, pendingCount: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runSyncCycle(opts?: {
  preferLocal?: boolean;
  pushOnly?: boolean;
  batchSize?: number;
}) {
  const store = readStore();
  const preferLocal = opts?.preferLocal !== false;
  const pushOnly = opts?.pushOnly === true;
  const batchSize = Math.min(Math.max(opts?.batchSize ?? 40, 5), 100);

  if (!getConfiguredDatabaseUrl()) {
    store.online = false;
    store.lastError = 'PostgreSQL não configurado — trabalhando offline';
    store.lastPullOperations = [];
    writeStore(store);
    return getSyncSnapshot();
  }

  let online = false;
  let healthDetail: string | undefined;
  try {
    const db = await getCentralPrisma();
    if (db) {
      await db.$queryRaw`SELECT 1`;
      online = true;
    }
  } catch (e) {
    online = false;
    healthDetail = e instanceof Error ? e.message : String(e);
  }
  store.online = online;

  if (!online) {
    store.lastError =
      healthDetail?.includes('Authentication failed')
        ? 'PostgreSQL recusou login — confira usuário/senha em Configurações → Banco online'
        : healthDetail ?? 'Servidor indisponível — trabalhando offline';
    store.lastPullOperations = [];
    writeStore(store);
    return getSyncSnapshot();
  }

  let auth = getSyncAuthStatus();
  if (!auth.configured) {
    const connected = await connectCentral({ deviceName: readSyncAuth().deviceName });
    if (!connected.ok) {
      store.lastError = connected.error;
      store.lastPullOperations = [];
      writeStore(store);
      return { ...getSyncSnapshot(), skipped: true, reason: 'no-session' };
    }
    auth = connected.status;
  }

  const ids = getSyncSessionIds();
  const companyId = ids.companyId;
  const userId = ids.userId;
  const deviceId = ids.deviceId || auth.deviceId;
  if (!companyId || !userId || !deviceId) {
    store.lastError = 'Sessão central incompleta — reconecte em Configurações → Banco online';
    store.lastPullOperations = [];
    writeStore(store);
    return { ...getSyncSnapshot(), skipped: true, reason: 'no-session' };
  }

  const core = await getSyncCore();
  if (!core) {
    store.lastError = 'Não foi possível abrir o núcleo de sincronização';
    store.lastPullOperations = [];
    writeStore(store);
    return getSyncSnapshot();
  }

  // Local-first: conflitos anteriores voltam pra fila com versão maior
  if (preferLocal) {
    for (const op of store.pending) {
      if (op.status === 'CONFLICT') {
        op.status = 'PENDING';
        op.version = Math.max(1, Number(op.version) || 1) + 1;
        op.lastError = undefined;
      }
    }
  }

  const batch = store.pending
    .filter((o) => o.status === 'PENDING' || o.status === 'ERROR')
    .slice(0, batchSize);

  let pushed = 0;
  let conflicts = 0;
  let errors = 0;

  if (batch.length > 0) {
    batch.forEach((o) => {
      o.status = 'SYNCING';
      o.companyId = companyId;
      o.userId = userId;
      o.deviceId = deviceId;
    });
    writeStore(store);

    try {
      const operations = batch.map(({ status: _s, lastError: _e, ...op }) => op) as SyncOperation[];
      const body = await core.push(companyId, deviceId, userId, operations);
      const accepted = new Set(body.accepted ?? []);
      const conflictIds = new Set(
        (body.conflicts ?? []).map((c) => c.originOperationId),
      );
      const errorMap = new Map(
        (body.errors ?? []).map((e) => [e.originOperationId, e.message]),
      );

      for (const op of store.pending) {
        if (accepted.has(op.originOperationId)) {
          op.status = 'SYNCED';
          pushed += 1;
        } else if (conflictIds.has(op.originOperationId)) {
          if (preferLocal) {
            op.status = 'PENDING';
            op.version = Math.max(1, Number(op.version) || 1) + 1;
            op.lastError = 'Conflito — reenviando com prioridade local';
          } else {
            op.status = 'CONFLICT';
            conflicts += 1;
          }
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
  let pullFailed = false;
  let pullError: string | null = null;
  const pullOperations: PullOperation[] = [];
  if (!pushOnly) {
    try {
      let since = store.lastSyncAt ?? new Date(0).toISOString();
      let guard = 0;
      while (guard < 50) {
        guard += 1;
        const page = await core.pull(companyId, deviceId, new Date(since), 200);
        for (const op of page.operations) {
          pullOperations.push({
            originOperationId: op.originOperationId,
            entityType: op.entityType,
            entityId: op.entityId,
            action: op.action,
            payload: op.payload,
            version: op.version,
            occurredAt: op.occurredAt,
          });
        }
        pulled += page.operations.length;
        if (!page.hasMore || !page.nextSince) break;
        since = page.nextSince;
      }
    } catch (e) {
      pullFailed = true;
      pullError = e instanceof Error ? e.message : String(e);
    }
  }

  store.lastPullOperations = pullOperations;
  // Só avança o cursor se o pull ok (evita “pular” dados do outro PC)
  if (!pullFailed) {
    store.lastSyncAt = new Date().toISOString();
  }
  store.lastError =
    errors > 0
      ? 'Há operações com erro — a fila continua tentando'
      : pullFailed
        ? `Push ok; pull falhou: ${pullError}`
        : null;
  store.history.unshift({
    at: new Date().toISOString(),
    pushed,
    pulled,
    conflicts,
    errors,
    success: errors === 0 && !pullFailed,
  });
  store.history = store.history.slice(0, 50);
  store.pending = store.pending.filter((o) => o.status !== 'SYNCED');
  writeStore(store);

  return {
    ...getSyncSnapshot(),
    lastPullOperations: pullOperations,
    remoteApplied: pullOperations.length,
  };
}

/** Importa entidades de outro device (mesma empresa) para aplicar localmente. */
export async function importFromDevice(deviceId: string): Promise<
  | { ok: true; operations: PullOperation[]; count: number }
  | { ok: false; error: string }
> {
  try {
    const db = await getCentralPrisma();
    const auth = readSyncAuth();
    if (!db || !auth.companyId) {
      return { ok: false, error: 'PostgreSQL não configurado ou sem empresa.' };
    }
    if (!deviceId.trim()) {
      return { ok: false, error: 'Informe o dispositivo de origem.' };
    }
    const rows = await db.$queryRawUnsafe<
      Array<{
        id: string;
        entityType: string;
        payload: unknown;
        version: number;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(
      `SELECT "id","entityType","payload","version","createdAt","updatedAt"
       FROM "sync_entities"
       WHERE "companyId" = $1 AND "deviceId" = $2 AND "deletedAt" IS NULL
       ORDER BY "updatedAt" ASC
       LIMIT 2000`,
      auth.companyId,
      deviceId,
    );

    const operations: PullOperation[] = rows
      .filter((r) => {
        const t = r.entityType;
        return (
          t === 'Purchase' ||
          t === 'Sale' ||
          t === 'Material' ||
          t === 'Contact' ||
          t === 'FinanceDay' ||
          t === 'CashLoan' ||
          t === 'PatioMovement' ||
          t === 'CashRegister' ||
          t === 'CashRegisterMovement' ||
          t === 'SaleComment'
        );
      })
      .map((r) => {
      const payload =
        r.payload && typeof r.payload === 'object'
          ? (r.payload as Record<string, unknown>)
          : {};
      return {
        originOperationId: `import-${deviceId}-${r.id}`,
        entityType: r.entityType,
        entityId: String(payload.id ?? r.id),
        action: 'UPDATE',
        payload: { ...payload, id: payload.id ?? r.id, version: r.version },
        version: r.version,
        occurredAt: new Date(r.updatedAt).toISOString(),
      };
    });

    return { ok: true, operations, count: operations.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listSyncConflicts() {
  const ids = getSyncSessionIds();
  if (!ids.companyId) return [];
  const core = await getSyncCore();
  if (!core) return [];
  return core.listConflicts(ids.companyId);
}

export async function resolveSyncConflict(input: {
  conflictId: string;
  resolution: 'KEEP_LOCAL' | 'KEEP_SERVER' | 'MERGE';
  justification: string;
  mergedPayload?: Record<string, unknown>;
}) {
  const ids = getSyncSessionIds();
  if (!ids.companyId || !ids.userId) {
    return { ok: false as const, error: 'Sessão central incompleta' };
  }
  const core = await getSyncCore();
  if (!core) return { ok: false as const, error: 'Banco indisponível' };
  try {
    await core.resolveConflict(
      input.conflictId,
      ids.companyId,
      ids.userId,
      input.resolution,
      input.justification,
      input.mergedPayload,
    );
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
