import { loadJson, saveJson } from './local-store';

export type RemoteSyncOp = {
  originOperationId: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | string;
  payload: Record<string, unknown>;
  version: number;
  occurredAt: string;
};

const ARRAY_KEYS: Record<string, string> = {
  Purchase: 'purchases',
  Sale: 'sales',
  Material: 'materials',
  Contact: 'contacts',
  FinanceDay: 'finance-days',
  CashLoan: 'cash-loans',
  PatioMovement: 'patio-movements',
  CashRegister: 'cash-registers',
};

/** Tipos seguros para importar de outro PC (evita sobrescrever settings/UI deste PC). */
export const IMPORTABLE_ENTITY_TYPES = new Set(Object.keys(ARRAY_KEYS).concat([
  'CashRegisterMovement',
  'SaleComment',
]));

type CashRow = {
  id: string;
  movements: Array<Record<string, unknown>>;
  [k: string]: unknown;
};

function safeSaveJson<T>(key: string, value: T): boolean {
  try {
    saveJson(key, value);
    return true;
  } catch (e) {
    console.error(`[sync-apply] falha ao gravar ${key}`, e);
    return false;
  }
}

function upsertInArray(
  all: Array<Record<string, unknown>>,
  entityId: string,
  payload: Record<string, unknown>,
  remove: boolean,
): Array<Record<string, unknown>> {
  const idx = all.findIndex((r) => r.id === entityId);
  if (remove) {
    if (idx >= 0) all.splice(idx, 1);
    return all;
  }
  const row: Record<string, unknown> = { ...payload, id: entityId };
  // Datas obrigatórias para sort/UI — import de outro PC às vezes vem incompleto
  if (!row.purchasedAt && row.createdAt) row.purchasedAt = row.createdAt;
  if (!row.soldAt && row.createdAt) row.soldAt = row.createdAt;
  if (!row.openedAt && row.createdAt) row.openedAt = row.createdAt;
  if (!row.purchasedAt) row.purchasedAt = new Date().toISOString();
  if (!row.soldAt) row.soldAt = row.purchasedAt || new Date().toISOString();
  if (!row.openedAt) row.openedAt = new Date().toISOString();
  if (idx >= 0) {
    const localVer = Number(all[idx]!.version ?? 0);
    const remoteVer = Number(payload.version ?? 0);
    if (localVer > remoteVer && localVer > 0) return all;
    all[idx] = { ...all[idx], ...row };
  } else {
    all.unshift(row);
  }
  return all;
}

function applyCashMovementInMemory(
  cashList: CashRow[],
  op: RemoteSyncOp,
): CashRow[] {
  const cashId = String(op.payload.cashRegisterId ?? '');
  if (!cashId) return cashList;

  let cash = cashList.find((c) => c.id === cashId);
  if (!cash) {
    cash = {
      id: cashId,
      movements: [],
      status: 'CLOSED',
      openingBalance: 0,
      openedAt: op.occurredAt,
      openedBy: 'import',
    };
    cashList.unshift(cash);
  }
  if (!Array.isArray(cash.movements)) cash.movements = [];

  const movPayload = { ...op.payload };
  delete movPayload.cashRegisterId;
  const midx = cash.movements.findIndex((m) => m.id === op.entityId);
  if (op.action === 'DELETE') {
    cash.movements = cash.movements.filter((m) => m.id !== op.entityId);
  } else if (midx >= 0) {
    cash.movements[midx] = { ...cash.movements[midx], ...movPayload, id: op.entityId };
  } else {
    cash.movements.push({ ...movPayload, id: op.entityId });
  }
  return cashList;
}

function applySaleCommentInMemory(
  sales: Array<Record<string, unknown>>,
  op: RemoteSyncOp,
): Array<Record<string, unknown>> {
  const saleId = String(op.payload.saleId ?? '');
  if (!saleId) return sales;
  const sale = sales.find((s) => s.id === saleId);
  if (!sale) return sales;
  const comments = Array.isArray(sale.comments)
    ? (sale.comments as Array<Record<string, unknown>>)
    : [];
  sale.comments = comments;
  const idx = comments.findIndex((c) => c.id === op.entityId);
  if (op.action === 'DELETE') {
    sale.comments = comments.filter((c) => c.id !== op.entityId);
  } else if (idx >= 0) {
    comments[idx] = { ...comments[idx], ...op.payload, id: op.entityId };
  } else {
    comments.push({ ...op.payload, id: op.entityId });
  }
  return sales;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export type ApplyProgress = {
  done: number;
  total: number;
  applied: number;
  skipped: number;
};

/**
 * Aplica ops em memória por chave e grava localStorage em lotes,
 * liberando a UI entre chunks (evita tela preta / mouse morto).
 */
export async function applyRemoteOperationsAsync(
  operations: RemoteSyncOp[],
  opts?: {
    chunkSize?: number;
    onProgress?: (p: ApplyProgress) => void;
    /** Se true, ignora ApplicationSetting e tipos fora da lista segura */
    importMode?: boolean;
  },
): Promise<{ applied: number; skipped: number }> {
  const chunkSize = Math.max(10, opts?.chunkSize ?? 50);
  const importMode = opts?.importMode === true;
  const caches = new Map<string, Array<Record<string, unknown>>>();
  const dirty = new Set<string>();

  const getCache = (key: string) => {
    let list = caches.get(key);
    if (!list) {
      list = loadJson<Array<Record<string, unknown>>>(key, []);
      if (!Array.isArray(list)) list = [];
      caches.set(key, list);
    }
    return list;
  };

  let applied = 0;
  let skipped = 0;
  const total = operations.length;

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]!;
    try {
      if (importMode && !IMPORTABLE_ENTITY_TYPES.has(op.entityType)) {
        skipped += 1;
      } else if (op.entityType === 'ApplicationSetting') {
        // Nunca sobrescrever settings deste PC via import/pull em massa
        skipped += 1;
      } else if (op.entityType === 'CashRegisterMovement') {
        const list = getCache('cash-registers') as CashRow[];
        applyCashMovementInMemory(list, op);
        dirty.add('cash-registers');
        applied += 1;
      } else if (op.entityType === 'SaleComment') {
        const list = getCache('sales');
        applySaleCommentInMemory(list, op);
        dirty.add('sales');
        applied += 1;
      } else {
        const key = ARRAY_KEYS[op.entityType];
        if (!key) {
          skipped += 1;
        } else {
          const list = getCache(key);
          upsertInArray(list, op.entityId, op.payload, op.action === 'DELETE');
          dirty.add(key);
          applied += 1;
        }
      }
    } catch (e) {
      console.error('[sync-apply] op falhou', op.entityType, op.entityId, e);
      skipped += 1;
    }

    const done = i + 1;
    if (done % chunkSize === 0 || done === total) {
      for (const key of dirty) {
        safeSaveJson(key, caches.get(key) ?? []);
      }
      dirty.clear();
      opts?.onProgress?.({ done, total, applied, skipped });
      await yieldToUi();
    }
  }

  for (const key of dirty) {
    safeSaveJson(key, caches.get(key) ?? []);
  }

  return { applied, skipped };
}

/** Compat: sync imediato (lotes pequenos internos). Preferir async. */
export function applyRemoteOperations(operations: RemoteSyncOp[]): {
  applied: number;
  skipped: number;
} {
  const caches = new Map<string, Array<Record<string, unknown>>>();
  const dirty = new Set<string>();
  let applied = 0;
  let skipped = 0;

  const getCache = (key: string) => {
    let list = caches.get(key);
    if (!list) {
      list = loadJson<Array<Record<string, unknown>>>(key, []);
      if (!Array.isArray(list)) list = [];
      caches.set(key, list);
    }
    return list;
  };

  for (const op of operations) {
    try {
      if (op.entityType === 'ApplicationSetting') {
        skipped += 1;
        continue;
      }
      if (op.entityType === 'CashRegisterMovement') {
        applyCashMovementInMemory(getCache('cash-registers') as CashRow[], op);
        dirty.add('cash-registers');
        applied += 1;
        continue;
      }
      if (op.entityType === 'SaleComment') {
        applySaleCommentInMemory(getCache('sales'), op);
        dirty.add('sales');
        applied += 1;
        continue;
      }
      const key = ARRAY_KEYS[op.entityType];
      if (!key) {
        skipped += 1;
        continue;
      }
      upsertInArray(getCache(key), op.entityId, op.payload, op.action === 'DELETE');
      dirty.add(key);
      applied += 1;
    } catch {
      skipped += 1;
    }
  }
  for (const key of dirty) {
    safeSaveJson(key, caches.get(key) ?? []);
  }
  return { applied, skipped };
}
