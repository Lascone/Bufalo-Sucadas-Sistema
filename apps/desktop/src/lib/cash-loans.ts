import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import {
  addCashMovement,
  ensureOpenCash,
  getOpenCash,
  type CashRegisterRecord,
} from './cash';

export type CashLoanRecord = {
  id: string;
  person: string;
  amount: number;
  status: 'OPEN' | 'PAID';
  borrowedAt: string;
  borrowedBy: string;
  borrowCashId: string;
  borrowMovementId: string;
  note?: string;
  repaidAt?: string;
  repayCashId?: string;
  repayMovementId?: string;
};

const KEY = 'cash-loans';

function persist(all: CashLoanRecord[]) {
  saveJson(KEY, all);
}

export function listCashLoans(): CashLoanRecord[] {
  return loadJson<CashLoanRecord[]>(KEY, []).sort((a, b) =>
    b.borrowedAt.localeCompare(a.borrowedAt),
  );
}

export function listOpenCashLoans(): CashLoanRecord[] {
  return listCashLoans().filter((l) => l.status === 'OPEN');
}

export function totalOpenCashLoans(): number {
  return Math.round(
    listOpenCashLoans().reduce((a, l) => a + l.amount, 0) * 100,
  ) / 100;
}

export function getCashLoan(id: string): CashLoanRecord | undefined {
  return listCashLoans().find((l) => l.id === id);
}

/** Registra “Peguei emprestado”: dinheiro entra no caixa + dívida a devolver. */
export async function borrowCashLoan(input: {
  openedBy: string;
  person: string;
  amount: number;
  note?: string;
}): Promise<{ cash: CashRegisterRecord; loan: CashLoanRecord; created: boolean }> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Informe um valor válido do troco emprestado.');
  }
  const person = input.person.trim();
  if (!person) throw new Error('Informe de quem pegou emprestado.');

  const { cash, created } = await ensureOpenCash({ openedBy: input.openedBy });
  const loanId = newId();
  const note = input.note?.trim();
  const description = `Peguei emprestado — ${person}`;
  const detail = note || undefined;

  const updated = await addCashMovement(cash.id, {
    movementType: 'EMPRESTIMO',
    amount,
    description,
    detail,
    refType: 'LOAN',
    refId: loanId,
  });
  const mov = updated.movements[updated.movements.length - 1]!;

  const loan: CashLoanRecord = {
    id: loanId,
    person,
    amount,
    status: 'OPEN',
    borrowedAt: mov.movedAt,
    borrowedBy: input.openedBy,
    borrowCashId: cash.id,
    borrowMovementId: mov.id,
    note: note || undefined,
  };
  const all = listCashLoans();
  all.unshift(loan);
  persist(all);
  await enqueueSyncOp({
    entityType: 'CashLoan',
    entityId: loan.id,
    action: 'CREATE',
    payload: loan as unknown as Record<string, unknown>,
  });

  return { cash: updated, loan, created };
}

/** Devolve um empréstimo aberto: dinheiro sai do caixa. */
export async function repayCashLoan(input: {
  loanId: string;
  openedBy: string;
}): Promise<{ cash: CashRegisterRecord; loan: CashLoanRecord }> {
  const all = listCashLoans();
  const idx = all.findIndex((l) => l.id === input.loanId);
  if (idx < 0) throw new Error('Empréstimo não encontrado.');
  const loan = all[idx]!;
  if (loan.status !== 'OPEN') throw new Error('Esse empréstimo já foi devolvido.');

  const open = getOpenCash();
  if (!open) throw new Error('Abra o caixa para devolver o troco.');

  const { cash, created } = await ensureOpenCash({ openedBy: input.openedBy });
  void created;

  const updated = await addCashMovement(cash.id, {
    movementType: 'DEVOLUCAO_EMPRESTIMO',
    amount: loan.amount,
    description: `Devolução — ${loan.person}`,
    detail: loan.note || undefined,
    refType: 'LOAN',
    refId: loan.id,
  });
  const mov = updated.movements[updated.movements.length - 1]!;

  const paid: CashLoanRecord = {
    ...loan,
    status: 'PAID',
    repaidAt: mov.movedAt,
    repayCashId: cash.id,
    repayMovementId: mov.id,
  };
  all[idx] = paid;
  persist(all);
  await enqueueSyncOp({
    entityType: 'CashLoan',
    entityId: paid.id,
    action: 'UPDATE',
    payload: paid as unknown as Record<string, unknown>,
    version: 2,
  });

  return { cash: updated, loan: paid };
}

/** Se apagar o lançamento de empréstimo no caixa, remove a dívida pendente. */
export async function cancelCashLoanByBorrowMovement(
  movementId: string,
): Promise<boolean> {
  const all = listCashLoans();
  const idx = all.findIndex(
    (l) => l.borrowMovementId === movementId && l.status === 'OPEN',
  );
  if (idx < 0) return false;
  const loan = all[idx]!;
  all.splice(idx, 1);
  persist(all);
  await enqueueSyncOp({
    entityType: 'CashLoan',
    entityId: loan.id,
    action: 'DELETE',
    payload: { id: loan.id },
  });
  return true;
}
