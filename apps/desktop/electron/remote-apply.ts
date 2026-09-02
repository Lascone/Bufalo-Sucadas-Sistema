import { loadDataStore, persistNow, PREFIX } from './data-store';

type RemoteOp = {
  originOperationId: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  payload: Record<string, unknown>;
  deviceId?: string;
};

const ENTITY_KEY: Record<string, string> = {
  Contact: 'contacts',
  Material: 'materials',
  Sale: 'sales',
  Purchase: 'purchases',
  PatioMovement: 'patio-movements',
  FinanceDay: 'finance-days',
  CashRegister: 'cash-registers',
};

function getArray(store: Record<string, unknown>, key: string): unknown[] {
  const full = PREFIX + key;
  const val = store[full];
  return Array.isArray(val) ? [...val] : [];
}

function setArray(store: Record<string, unknown>, key: string, arr: unknown[]) {
  store[PREFIX + key] = arr;
}

function upsertById(arr: Record<string, unknown>[], record: Record<string, unknown>): Record<string, unknown>[] {
  const id = String(record.id);
  const idx = arr.findIndex((r) => String(r.id) === id);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...record };
  } else {
    arr.unshift(record);
  }
  return arr;
}

function applyCashMovement(
  store: Record<string, unknown>,
  op: RemoteOp,
): void {
  const p = op.payload;
  const cashRegisterId = String(p.cashRegisterId ?? '');
  if (!cashRegisterId) return;
  const registers = getArray(store, 'cash-registers') as Record<string, unknown>[];
  const cash = registers.find((c) => String(c.id) === cashRegisterId);
  if (!cash) return;
  const movements = Array.isArray(cash.movements)
    ? ([...(cash.movements as Record<string, unknown>[])] as Record<string, unknown>[])
    : [];

  if (op.action === 'DELETE') {
    cash.movements = movements.filter((m) => String(m.id) !== op.entityId);
  } else {
    const mov = { ...p, id: op.entityId };
    const idx = movements.findIndex((m) => String(m.id) === op.entityId);
    if (idx >= 0) movements[idx] = { ...movements[idx], ...mov };
    else movements.push(mov);
    cash.movements = movements;
  }
  setArray(store, 'cash-registers', registers);
}

export function applyRemoteOperations(ops: RemoteOp[]): number {
  if (ops.length === 0) return 0;
  const store = { ...loadDataStore() };
  let applied = 0;

  for (const op of ops) {
    if (op.entityType === 'CashRegisterMovement') {
      applyCashMovement(store, op);
      applied += 1;
      continue;
    }

    if (op.entityType === 'SaleComment' || op.entityType === 'ApplicationSetting') {
      continue;
    }

    const key = ENTITY_KEY[op.entityType];
    if (!key) continue;

    let arr = getArray(store, key) as Record<string, unknown>[];

    if (op.action === 'DELETE') {
      if (op.entityType === 'FinanceDay') {
        arr = arr.map((r) =>
          String(r.id) === op.entityId
            ? { ...r, deletedAt: new Date().toISOString() }
            : r,
        );
      } else {
        arr = arr.filter((r) => String(r.id) !== op.entityId);
      }
    } else {
      const record = { ...op.payload, id: op.entityId };
      if (op.entityType === 'FinanceDay' && op.action === 'RESTORE') {
        (record as Record<string, unknown>).deletedAt = undefined;
      }
      arr = upsertById(arr, record);
    }

    setArray(store, key, arr);
    applied += 1;
  }

  if (applied > 0) {
    persistNow(store, 'remote-pull');
  }
  return applied;
}
