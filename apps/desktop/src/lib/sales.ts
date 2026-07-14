import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import { lineTotal } from './materials';
import { ensureOpenCash, addCashMovement } from './cash';

export type SaleComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type SaleItem = {
  id: string;
  materialId: string;
  materialName: string;
  weight: number;
  unitPrice: number;
  lineTotal: number;
  buyPriceRef?: number;
};

export type SaleRecord = {
  id: string;
  documentNumber: string;
  soldAt: string;
  customerName: string;
  notes: string;
  items: SaleItem[];
  netTotal: number;
  amountReceived: number;
  status: string;
  comments: SaleComment[];
  cashPosted: boolean;
};

const KEY = 'sales';

export function listSales(): SaleRecord[] {
  return loadJson<SaleRecord[]>(KEY, [])
    .map((s) => ({
      ...s,
      items: s.items ?? [],
      amountReceived: s.amountReceived ?? s.netTotal,
      comments: s.comments ?? [],
      cashPosted: s.cashPosted ?? false,
    }))
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

export function getSale(id: string): SaleRecord | undefined {
  return listSales().find((s) => s.id === id);
}

function persist(all: SaleRecord[]) {
  saveJson(KEY, all);
}

export function calcSaleTotal(items: Array<{ weight: number; unitPrice: number }>): number {
  return Math.round(items.reduce((acc, i) => acc + lineTotal(i.weight, i.unitPrice), 0) * 100) / 100;
}

export async function createSale(input: {
  customerName: string;
  notes: string;
  items: Array<{
    materialId: string;
    materialName: string;
    weight: number;
    unitPrice: number;
    buyPriceRef?: number;
  }>;
  amountReceived?: number;
  openedBy: string;
}): Promise<{ sale: SaleRecord; cashInfo?: string }> {
  if (!input.items.length) throw new Error('Adicione ao menos um material na venda');

  const items: SaleItem[] = input.items.map((i) => ({
    id: newId(),
    materialId: i.materialId,
    materialName: i.materialName,
    weight: i.weight,
    unitPrice: i.unitPrice,
    lineTotal: lineTotal(i.weight, i.unitPrice),
    buyPriceRef: i.buyPriceRef,
  }));
  const netTotal = calcSaleTotal(items);
  const amountReceived =
    input.amountReceived === undefined || Number.isNaN(input.amountReceived)
      ? netTotal
      : input.amountReceived;

  const all = listSales();
  const record: SaleRecord = {
    id: newId(),
    documentNumber: `V-${String(all.length + 1).padStart(6, '0')}`,
    soldAt: new Date().toISOString(),
    customerName: input.customerName,
    notes: input.notes,
    items,
    netTotal,
    amountReceived,
    status: 'FINALIZED',
    comments: [],
    cashPosted: false,
  };

  const { cash, created } = await ensureOpenCash({ openedBy: input.openedBy });
  await addCashMovement(cash.id, {
    movementType: 'VENDA_RECEBIDA',
    amount: amountReceived,
    description: `Venda ${record.documentNumber} — ${record.customerName}`,
  });
  record.cashPosted = true;

  all.unshift(record);
  persist(all);
  await enqueueSyncOp({
    entityType: 'Sale',
    entityId: record.id,
    action: 'CREATE',
    payload: record as unknown as Record<string, unknown>,
  });

  return {
    sale: record,
    cashInfo: created ? 'Caixa aberto automaticamente para registrar a venda.' : undefined,
  };
}

export async function addSaleComment(
  saleId: string,
  body: string,
  authorName: string,
) {
  const all = listSales();
  const sale = all.find((s) => s.id === saleId);
  if (!sale) throw new Error('Venda não encontrada');
  const comment: SaleComment = {
    id: newId(),
    body,
    authorName,
    createdAt: new Date().toISOString(),
  };
  sale.comments.push(comment);
  persist(all);
  await enqueueSyncOp({
    entityType: 'SaleComment',
    entityId: comment.id,
    action: 'CREATE',
    payload: { ...comment, saleId },
  });
  return sale;
}
