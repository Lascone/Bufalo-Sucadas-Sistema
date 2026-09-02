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
  emprestimos: number;
  devolucoesEmprestimo: number;
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
    movements
      .filter((m) => m.movementType === type && !m.voidedAt)
      .reduce((a, m) => a + m.amount, 0) * 100,
  ) / 100;
}

export function calcDayTotals(movements: CashMovement[]): FinanceDayTotals {
  return {
    vendasRecebidas:
      Math.round(
        (sumBy(movements, 'VENDA_RECEBIDA') + sumBy(movements, 'TROCADO')) * 100,
      ) / 100,
    despesas: sumBy(movements, 'DESPESA'),
    sangrias: sumBy(movements, 'SANGRIA'),
    suprimentos: sumBy(movements, 'SUPRIMENTO'),
    entradas: sumBy(movements, 'ENTRADA'),
    saidas: sumBy(movements, 'SAIDA'),
    comprasPagas: sumBy(movements, 'COMPRA_PAGA'),
    emprestimos: sumBy(movements, 'EMPRESTIMO'),
    devolucoesEmprestimo: sumBy(movements, 'DEVOLUCAO_EMPRESTIMO'),
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
  const raw = loadJson<FinanceDayRecord[] | null>(KEY, []);
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((d): d is FinanceDayRecord => !!d && typeof d === 'object' && !!d.id)
    .filter((d) => includeDeleted || !d.deletedAt)
    .map((d) => ({
      ...d,
      closedAt:
        typeof d.closedAt === 'string' && d.closedAt
          ? d.closedAt
          : d.openedAt || '1970-01-01T00:00:00.000Z',
      openedAt:
        typeof d.openedAt === 'string' && d.openedAt
          ? d.openedAt
          : '1970-01-01T00:00:00.000Z',
      businessDate: String(d.businessDate ?? '').slice(0, 10) || '1970-01-01',
      movements: Array.isArray(d.movements) ? d.movements : [],
      totals: d.totals ?? {
        vendasRecebidas: 0,
        despesas: 0,
        sangrias: 0,
        suprimentos: 0,
        entradas: 0,
        saidas: 0,
        comprasPagas: 0,
        emprestimos: 0,
        devolucoesEmprestimo: 0,
      },
    }))
    .sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
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

export type FinanceDayTimelineItem =
  | {
      kind: 'cut';
      label: string;
      at: string;
    }
  | {
      kind: 'movement';
      movement: CashMovement;
      sessionId: string;
    };

export type FinanceDayGroup = {
  businessDate: string;
  sessions: FinanceDayRecord[];
  openedAt: string;
  closedAt: string;
  openedBy: string;
  openingBalance: number;
  expectedBalance: number;
  informedBalance: number;
  difference: number;
  notes: string;
  totals: FinanceDayTotals;
  timeline: FinanceDayTimelineItem[];
  /** Flat movements (no cuts) for purchase matching etc. */
  movements: CashMovement[];
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Agrupa vários fechamentos do mesmo dia civil em um único relatório. */
export function groupFinanceDaysByBusinessDate(
  days: FinanceDayRecord[],
): FinanceDayGroup[] {
  const map = new Map<string, FinanceDayRecord[]>();
  for (const d of days) {
    if (d.deletedAt) continue;
    const list = map.get(d.businessDate) ?? [];
    list.push(d);
    map.set(d.businessDate, list);
  }

  const groups: FinanceDayGroup[] = [];
  for (const [businessDate, sessionsRaw] of map) {
    const sessions = [...sessionsRaw].sort((a, b) =>
      a.openedAt.localeCompare(b.openedAt),
    );
    const first = sessions[0]!;
    const last = sessions[sessions.length - 1]!;
    const movements: CashMovement[] = [];
    const timeline: FinanceDayTimelineItem[] = [];

    sessions.forEach((s, idx) => {
      if (idx > 0) {
        timeline.push({
          kind: 'cut',
          at: s.openedAt,
          label: `Caixa reaberto ${fmtTime(s.openedAt)}`,
        });
      }
      for (const m of s.movements) {
        movements.push(m);
        timeline.push({ kind: 'movement', movement: m, sessionId: s.id });
      }
      timeline.push({
        kind: 'cut',
        at: s.closedAt,
        label: `Caixa fechado ${fmtTime(s.closedAt)}`,
      });
    });
    const totals = calcDayTotals(movements);

    const openingBalance = first.openingBalance;
    // Esperado do dia = inicial do 1º + efeito líquido de todos os movimentos (ignora anulados)
    const expectedBalance =
      Math.round(
        (openingBalance +
          movements.reduce((acc, m) => {
            if (m.voidedAt) return acc;
            const t = m.movementType;
            const inTypes = [
              'ENTRADA',
              'SUPRIMENTO',
              'VENDA_RECEBIDA',
              'TROCADO',
              'EMPRESTIMO',
            ];
            const outTypes = [
              'SAIDA',
              'SANGRIA',
              'DESPESA',
              'COMPRA_PAGA',
              'DEVOLUCAO_EMPRESTIMO',
            ];
            if (inTypes.includes(t)) return acc + m.amount;
            if (outTypes.includes(t)) return acc - m.amount;
            return acc;
          }, 0)) *
          100,
      ) / 100;
    const informedBalance = last.informedBalance;
    const notes = sessions
      .map((s) => s.notes?.trim())
      .filter(Boolean)
      .join(' · ');

    groups.push({
      businessDate,
      sessions,
      openedAt: first.openedAt,
      closedAt: last.closedAt,
      openedBy: [...new Set(sessions.map((s) => s.openedBy).filter(Boolean))].join(
        ', ',
      ),
      openingBalance,
      expectedBalance,
      informedBalance,
      difference: Math.round((informedBalance - expectedBalance) * 100) / 100,
      notes,
      totals,
      timeline,
      movements,
    });
  }

  return groups.sort((a, b) => b.businessDate.localeCompare(a.businessDate));
}

export function getFinanceDayGroup(
  businessDate: string,
): FinanceDayGroup | undefined {
  return groupFinanceDaysByBusinessDate(listFinanceDays()).find(
    (g) => g.businessDate === businessDate,
  );
}
