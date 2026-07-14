import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import { getSettings } from './settings';

export type CashMovement = {
  id: string;
  movementType:
    | 'ENTRADA'
    | 'SAIDA'
    | 'SANGRIA'
    | 'SUPRIMENTO'
    | 'COMPRA_PAGA'
    | 'VENDA_RECEBIDA'
    | 'DESPESA';
  amount: number;
  description: string;
  notes?: string;
  paymentMethod?: string;
  movedAt: string;
  refType?: 'PURCHASE' | 'SALE';
  refId?: string;
  /** Resumo humano: "Alumínio limpo 3 kg · Ferro 10 kg" */
  detail?: string;
};

export type CashRegisterRecord = {
  id: string;
  openedAt: string;
  closedAt?: string;
  openedBy: string;
  openingBalance: number;
  expectedBalance?: number;
  informedBalance?: number;
  difference?: number;
  differenceReason?: string;
  notes?: string;
  status: 'OPEN' | 'CLOSED';
  movements: CashMovement[];
};

const KEY = 'cash-registers';
const AUTO_CLOSE_REASON = 'Fechamento automático por horário';

export function listCashRegisters(): CashRegisterRecord[] {
  return loadJson<CashRegisterRecord[]>(KEY, []).sort((a, b) =>
    b.openedAt.localeCompare(a.openedAt),
  );
}

export function getOpenCash(): CashRegisterRecord | undefined {
  return listCashRegisters().find((c) => c.status === 'OPEN');
}

export function getLastClosedCash(): CashRegisterRecord | undefined {
  return listCashRegisters().find((c) => c.status === 'CLOSED');
}

/** Saldo sugerido na próxima abertura = informado no último fechamento (o que sobrou). */
export function getSuggestedOpeningBalance(): {
  amount: number;
  fromCash?: CashRegisterRecord;
  source: 'last_close' | 'settings';
} {
  const last = getLastClosedCash();
  if (last && last.informedBalance !== undefined) {
    return { amount: last.informedBalance, fromCash: last, source: 'last_close' };
  }
  const settings = getSettings();
  return {
    amount: settings['cash.defaultOpeningBalance'] ?? 0,
    source: 'settings',
  };
}

function persist(all: CashRegisterRecord[]) {
  saveJson(KEY, all);
}

export function calcExpected(cash: CashRegisterRecord): number {
  return cash.movements.reduce((acc, m) => {
    if (['ENTRADA', 'SUPRIMENTO', 'VENDA_RECEBIDA'].includes(m.movementType)) {
      return acc + m.amount;
    }
    return acc - m.amount;
  }, cash.openingBalance);
}

/** Today's auto-close cutoff as Date, or null if time invalid. */
export function getTodayAutoCloseAt(timeHHmm: string, now = new Date()): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeHHmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const cutoff = new Date(now);
  cutoff.setHours(hours, minutes, 0, 0);
  return cutoff;
}

export async function openCash(input: {
  openedBy: string;
  openingBalance: number;
  notes?: string;
  allowMultiple: boolean;
}) {
  const all = listCashRegisters();
  if (!input.allowMultiple && all.some((c) => c.status === 'OPEN')) {
    throw new Error('Já existe um caixa aberto. Feche o atual antes de abrir outro.');
  }
  const record: CashRegisterRecord = {
    id: newId(),
    openedAt: new Date().toISOString(),
    openedBy: input.openedBy,
    openingBalance: input.openingBalance,
    notes: input.notes,
    status: 'OPEN',
    movements: [],
  };
  all.unshift(record);
  persist(all);
  await enqueueSyncOp({
    entityType: 'CashRegister',
    entityId: record.id,
    action: 'CREATE',
    payload: record as unknown as Record<string, unknown>,
  });
  return record;
}

export async function ensureOpenCash(input: {
  openedBy: string;
  openingBalance?: number;
  notes?: string;
}): Promise<{ cash: CashRegisterRecord; created: boolean }> {
  const existing = getOpenCash();
  if (existing) return { cash: existing, created: false };

  const settings = getSettings();
  const suggested = getSuggestedOpeningBalance();
  const cash = await openCash({
    openedBy: input.openedBy,
    openingBalance: input.openingBalance ?? suggested.amount,
    notes:
      input.notes ??
      (suggested.source === 'last_close'
        ? 'Aberto automaticamente (saldo do fechamento anterior)'
        : 'Aberto automaticamente'),
    allowMultiple: settings['cash.allowMultipleOpen'],
  });
  return { cash, created: true };
}

export async function addCashMovement(
  cashId: string,
  movement: Omit<CashMovement, 'id' | 'movedAt'> & { movedAt?: string },
) {
  const all = listCashRegisters();
  const cash = all.find((c) => c.id === cashId);
  if (!cash || cash.status !== 'OPEN') throw new Error('Caixa não está aberto');
  const row: CashMovement = {
    id: newId(),
    movedAt: movement.movedAt ?? new Date().toISOString(),
    movementType: movement.movementType,
    amount: movement.amount,
    description: movement.description,
    paymentMethod: movement.paymentMethod,
    notes: movement.notes,
    refType: movement.refType,
    refId: movement.refId,
    detail: movement.detail,
  };
  cash.movements.push(row);
  persist(all);
  await enqueueSyncOp({
    entityType: 'CashRegisterMovement',
    entityId: row.id,
    action: 'CREATE',
    payload: { ...row, cashRegisterId: cashId },
  });
  return cash;
}

export async function addQuickExpense(input: {
  openedBy: string;
  description: string;
  amount: number;
}): Promise<{ cash: CashRegisterRecord; created: boolean }> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Informe um valor de gasto válido.');
  }
  const desc = input.description.trim();
  if (!desc) throw new Error('Descreva o que foi gasto.');

  const { cash, created } = await ensureOpenCash({ openedBy: input.openedBy });
  const updated = await addCashMovement(cash.id, {
    movementType: 'DESPESA',
    amount,
    description: desc,
  });
  return { cash: updated, created };
}

export async function updateCashMovement(
  cashId: string,
  movementId: string,
  patch: Partial<
    Pick<CashMovement, 'amount' | 'description' | 'movementType' | 'notes' | 'paymentMethod'>
  >,
) {
  const all = listCashRegisters();
  const cash = all.find((c) => c.id === cashId);
  if (!cash || cash.status !== 'OPEN') throw new Error('Caixa não está aberto');
  const idx = cash.movements.findIndex((m) => m.id === movementId);
  if (idx < 0) throw new Error('Movimento não encontrado');
  cash.movements[idx] = { ...cash.movements[idx], ...patch };
  persist(all);
  await enqueueSyncOp({
    entityType: 'CashRegisterMovement',
    entityId: movementId,
    action: 'UPDATE',
    payload: { ...cash.movements[idx], cashRegisterId: cashId },
    version: 2,
  });
  return cash;
}

export async function deleteCashMovement(cashId: string, movementId: string) {
  const all = listCashRegisters();
  const cash = all.find((c) => c.id === cashId);
  if (!cash || cash.status !== 'OPEN') throw new Error('Caixa não está aberto');
  const before = cash.movements.length;
  cash.movements = cash.movements.filter((m) => m.id !== movementId);
  if (cash.movements.length === before) throw new Error('Movimento não encontrado');
  persist(all);
  await enqueueSyncOp({
    entityType: 'CashRegisterMovement',
    entityId: movementId,
    action: 'DELETE',
    payload: { id: movementId, cashRegisterId: cashId },
  });
  return cash;
}

export async function appendMovementComment(
  cashId: string,
  movementId: string,
  comment: string,
) {
  const text = comment.trim();
  if (!text) throw new Error('Escreva o comentário.');
  const all = listCashRegisters();
  const cash = all.find((c) => c.id === cashId);
  if (!cash || cash.status !== 'OPEN') throw new Error('Caixa não está aberto');
  const mov = cash.movements.find((m) => m.id === movementId);
  if (!mov) throw new Error('Movimento não encontrado');
  const stamped = `${new Date().toLocaleString('pt-BR')}: ${text}`;
  const notes = mov.notes ? `${mov.notes}\n${stamped}` : stamped;
  return updateCashMovement(cashId, movementId, { notes });
}

export async function closeCash(input: {
  cashId: string;
  informedBalance: number;
  differenceReason?: string;
  requireReason: boolean;
}) {
  const all = listCashRegisters();
  const cash = all.find((c) => c.id === input.cashId);
  if (!cash || cash.status !== 'OPEN') throw new Error('Caixa não está aberto');
  const expected = calcExpected(cash);
  const difference = input.informedBalance - expected;
  if (input.requireReason && Math.abs(difference) > 0.009 && !input.differenceReason?.trim()) {
    throw new Error('Informe a justificativa da diferença no fechamento.');
  }
  cash.expectedBalance = expected;
  cash.informedBalance = input.informedBalance;
  cash.difference = difference;
  cash.differenceReason = input.differenceReason;
  cash.closedAt = new Date().toISOString();
  cash.status = 'CLOSED';
  persist(all);
  await enqueueSyncOp({
    entityType: 'CashRegister',
    entityId: cash.id,
    action: 'UPDATE',
    payload: cash as unknown as Record<string, unknown>,
    version: 2,
  });
  return cash;
}

/**
 * If auto-close is enabled and now is past today's cutoff, close any OPEN
 * cash that was opened before the cutoff. Works on boot even if the PC was off.
 */
export async function maybeAutoCloseCash(
  now = new Date(),
): Promise<CashRegisterRecord | null> {
  const settings = getSettings();
  if (!settings['cash.autoCloseEnabled']) return null;

  const cutoff = getTodayAutoCloseAt(settings['cash.autoCloseTime'], now);
  if (!cutoff || now < cutoff) return null;

  const open = getOpenCash();
  if (!open) return null;

  const openedAt = new Date(open.openedAt);
  if (openedAt >= cutoff) return null;

  const expected = calcExpected(open);
  return closeCash({
    cashId: open.id,
    informedBalance: expected,
    differenceReason: AUTO_CLOSE_REASON,
    requireReason: false,
  });
}
