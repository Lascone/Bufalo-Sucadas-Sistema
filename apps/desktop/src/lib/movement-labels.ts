import type { CashMovement } from './cash';

export const MOVEMENT_LABELS: Record<CashMovement['movementType'], string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  SANGRIA: 'Sangria',
  SUPRIMENTO: 'Suprimento',
  COMPRA_PAGA: 'Material comprado',
  VENDA_RECEBIDA: 'Venda',
  TROCADO: 'Trocado',
  DESPESA: 'Despesa',
  EMPRESTIMO: 'Peguei emprestado',
  DEVOLUCAO_EMPRESTIMO: 'Devolução',
};

/** Distinct colors: venda=verde, compra=laranja, despesa=vermelho, etc. */
export function movementTone(type: CashMovement['movementType']): {
  badge: string;
  amount: string;
  row?: string;
} {
  switch (type) {
    case 'VENDA_RECEBIDA':
    case 'TROCADO':
      return {
        badge: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30',
        amount: 'text-emerald-300',
        row: 'border-l-2 border-l-emerald-500/70',
      };
    case 'COMPRA_PAGA':
      return {
        badge: 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/30',
        amount: 'text-orange-300',
        row: 'border-l-2 border-l-orange-500/70',
      };
    case 'DESPESA':
      return {
        badge: 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30',
        amount: 'text-red-300',
        row: 'border-l-2 border-l-red-500/50',
      };
    case 'EMPRESTIMO':
      return {
        badge: 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/35',
        amount: 'text-violet-200',
        row: 'border-l-2 border-l-violet-500/60',
      };
    case 'DEVOLUCAO_EMPRESTIMO':
      return {
        badge: 'bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-fuchsia-500/30',
        amount: 'text-fuchsia-200',
        row: 'border-l-2 border-l-fuchsia-500/50',
      };
    case 'SANGRIA':
    case 'SAIDA':
      return {
        badge: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/25',
        amount: 'text-rose-300',
        row: 'border-l-2 border-l-rose-500/40',
      };
    case 'SUPRIMENTO':
    case 'ENTRADA':
      return {
        badge: 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/30',
        amount: 'text-sky-300',
        row: 'border-l-2 border-l-sky-500/50',
      };
    default:
      return {
        badge: 'bg-white/10 text-ink-200',
        amount: 'text-ink-100',
      };
  }
}

export function isCashIn(type: CashMovement['movementType']) {
  return (
    type === 'ENTRADA' ||
    type === 'SUPRIMENTO' ||
    type === 'VENDA_RECEBIDA' ||
    type === 'TROCADO' ||
    type === 'EMPRESTIMO'
  );
}

export function movementLabel(type: CashMovement['movementType']) {
  return MOVEMENT_LABELS[type] ?? type;
}
