import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import type { CashMovement, CashRegisterRecord } from './cash';
import { calcExpected } from './cash';

export type FinanceDayTotals = {
  vendasRecebidas: number;
  despesas: number;
  sangrias: number;
  suprimentos: number;
  entradas: number;
  saidas: number;
  comprasPagas: number;
};

export type FinanceDayRecord = {
  id: string;
  cashRegisterId: string;
  businessDate: string;
  openedAt: string;
  closedAt: string;
  openedBy: string;
  openingBalance: number;
  expectedBalance: number;
  informedBalance: number;
  difference: number;
  differenceReason: string;
  notes: string;
  totals: FinanceDayTotals;
  movements: CashMovement[];
  deletedAt?: string;
  updatedAt: string;
};

const KEY = 'finance-days';

function persist(all: FinanceDayRecord[]) {
  saveJson(KEY, all);
}

function sumBy(
  movements: CashMovement[],
  type: CashMovement['movementType'],
): number {
  return Math.round(
    movements.filter((m) => m.movementType === type).reduce((a, m) => a + m.amount, 0) * 100,
  ) / 100;
}

export function calcDayTotals(movements: CashMovement[]): FinanceDayTotals {
  return {
    vendasRecebidas: sumBy(movements, 'VENDA_RECEBIDA'),
    despesas: sumBy(movements, 'DESPESA'),
    sangrias: sumBy(movements, 'SANGRIA'),
    suprimentos: sumBy(movements, 'SUPRIMENTO'),
    entradas: sumBy(movements, 'ENTRADA'),
    saidas: sumBy(movements, 'SAIDA'),
    comprasPagas: sumBy(movements, 'COMPRA_PAGA'),
  };
}

function businessDateFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function listFinanceDays(includeDeleted = false): FinanceDayRecord[] {
  return loadJson<FinanceDayRecord[]>(KEY, [])
    .filter((d) => includeDeleted || !d.deletedAt)
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt));
}

export function getFinanceDay(id: string): FinanceDayRecord | undefined {
  return listFinanceDays(true).find((d) => d.id === id);
}

export async function upsertFinanceDayFromCash(
  cash: CashRegisterRecord,
): Promise<FinanceDayRecord> {
  if (cash.status !== 'CLOSED' || !cash.closedAt) {
    throw new Error('Só fecha no financeiro após o caixa ser fechado.');
  }
  const all = listFinanceDays(true);
  const expected = cash.expectedBalance ?? calcExpected(cash);
  const informed = cash.informedBalance ?? expected;
  const payload: Omit<FinanceDayRecord, 'id' | 'updatedAt'> & { id?: string } = {
    cashRegisterId: cash.id,
    businessDate: businessDateFromIso(cash.closedAt),
    openedAt: cash.openedAt,
    closedAt: cash.closedAt,
    openedBy: cash.openedBy,
    openingBalance: cash.openingBalance,
    expectedBalance: expected,
    informedBalance: informed,
    difference: cash.difference ?? informed - expected,
    differenceReason: cash.differenceReason ?? '',
    notes: cash.notes ?? '',
    totals: calcDayTotals(cash.movements),
    movements: [...cash.movements],
  };

  const existingIdx = all.findIndex((d) => d.cashRegisterId === cash.id && !d.deletedAt);
  if (existingIdx >= 0) {
    const updated: FinanceDayRecord = {
      ...all[existingIdx],
      ...payload,
      id: all[existingIdx].id,
      deletedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    all[existingIdx] = updated;
    persist(all);
    await enqueueSyncOp({
      entityType: 'FinanceDay',
      entityId: updated.id,
      action: 'UPDATE',
      payload: updated as unknown as Record<string, unknown>,
      version: 2,
    });
    return updated;
  }

  const created: FinanceDayRecord = {
    ...payload,
    id: newId(),
    updatedAt: new Date().toISOString(),
  };
  all.unshift(created);
  persist(all);
  await enqueueSyncOp({
    entityType: 'FinanceDay',
    entityId: created.id,
    action: 'CREATE',
    payload: created as unknown as Record<string, unknown>,
  });
  return created;
}

export async function updateFinanceDay(
  id: string,
  patch: Partial<
    Pick<
      FinanceDayRecord,
      'notes' | 'informedBalance' | 'differenceReason' | 'difference' | 'expectedBalance'
    >
  >,
): Promise<FinanceDayRecord> {
  const all = listFinanceDays(true);
  const idx = all.findIndex((d) => d.id === id);
  if (idx < 0) throw new Error('Registro financeiro não encontrado');
  if (all[idx].deletedAt) throw new Error('Registro excluído');

  const next = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  if (patch.informedBalance !== undefined) {
    next.difference = next.informedBalance - next.expectedBalance;
  }
  all[idx] = next;
  persist(all);
  await enqueueSyncOp({
    entityType: 'FinanceDay',
    entityId: next.id,
    action: 'UPDATE',
    payload: next as unknown as Record<string, unknown>,
    version: 2,
  });
  return next;
}

export async function deleteFinanceDay(id: string) {
  const all = listFinanceDays(true);
  const idx = all.findIndex((d) => d.id === id);
  if (idx < 0) throw new Error('Registro financeiro não encontrado');
  all[idx] = {
    ...all[idx],
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  persist(all);
  await enqueueSyncOp({
    entityType: 'FinanceDay',
    entityId: id,
    action: 'DELETE',
    payload: { id },
  });
}

/** Rehydrate finance list from closed cash registers (migration / catch-up). */
export async function syncFinanceFromClosedCash(
  closed: CashRegisterRecord[],
): Promise<number> {
  let n = 0;
  for (const cash of closed) {
    const exists = listFinanceDays(true).some(
      (d) => d.cashRegisterId === cash.id && !d.deletedAt,
    );
    if (!exists) {
      await upsertFinanceDayFromCash(cash);
      n += 1;
    }
  }
  return n;
}
