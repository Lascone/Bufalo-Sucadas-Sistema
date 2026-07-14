import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import { lineTotal } from './materials';
import { ensureOpenCash, addCashMovement } from './cash';
import { applySaleToPatio, getAvgCost } from './patio';
import { formatItemsSummary } from './item-summary';

export type SalePaymentMethod = 'PIX' | 'DINHEIRO';

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
  avgCostAtSale: number;
  grossProfit: number;
  buyPriceRef?: number;
};

export type SaleRecord = {
  id: string;
  documentNumber: string;
  soldAt: string;
  customerName: string;
  notes: string;
  items: SaleItem[];
  /** Soma dos itens antes do desconto */
  grossTotal: number;
  discountAmount: number;
  discountReason: string;
  /** grossTotal − discount */
  netTotal: number;
  amountReceived: number;
  paymentMethod: SalePaymentMethod;
  receivedBy: string;
  grossProfit: number;
  status: string;
  comments: SaleComment[];
  cashPosted: boolean;
  stockWarnings: string[];
};

const KEY = 'sales';

export function listSales(): SaleRecord[] {
  return loadJson<SaleRecord[]>(KEY, [])
    .map((s) => {
      const items = (s.items ?? []).map((i) => ({
        ...i,
        avgCostAtSale: i.avgCostAtSale ?? i.buyPriceRef ?? 0,
        grossProfit:
          i.grossProfit ??
          Math.round((i.unitPrice - (i.avgCostAtSale ?? 0)) * i.weight * 100) / 100,
      }));
      const grossTotal =
        s.grossTotal ??
        Math.round(items.reduce((a, i) => a + i.lineTotal, 0) * 100) / 100;
      const discountAmount = s.discountAmount ?? 0;
      return {
        ...s,
        items,
        grossTotal,
        discountAmount,
        discountReason: s.discountReason ?? '',
        netTotal: s.netTotal ?? Math.max(0, grossTotal - discountAmount),
        amountReceived: s.amountReceived ?? s.netTotal ?? grossTotal,
        paymentMethod: s.paymentMethod ?? 'DINHEIRO',
        receivedBy: s.receivedBy ?? '',
        comments: s.comments ?? [],
        cashPosted: s.cashPosted ?? false,
        grossProfit:
          s.grossProfit ??
          items.reduce((a, i) => a + (i.grossProfit ?? 0), 0) - discountAmount,
        stockWarnings: s.stockWarnings ?? [],
      };
    })
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
  paymentMethod: SalePaymentMethod;
  receivedBy: string;
  discountAmount?: number;
  discountReason?: string;
  amountReceived?: number;
  openedBy: string;
}): Promise<{ sale: SaleRecord; cashInfo?: string; stockWarnings: string[] }> {
  if (!input.items.length) throw new Error('Adicione ao menos um material na venda');
  if (input.paymentMethod !== 'PIX' && input.paymentMethod !== 'DINHEIRO') {
    throw new Error('Informe se recebeu em PIX ou dinheiro');
  }
  const receivedBy = input.receivedBy.trim();
  if (!receivedBy) throw new Error('Informe quem recebeu (sócio)');

  const gros = calcSaleTotal(input.items);
  const discountRaw = Number(input.discountAmount) || 0;
  if (discountRaw < 0) throw new Error('Desconto inválido');
  const discountAmount = Math.round(Math.min(discountRaw, gros) * 100) / 100;
  const discountReason = (input.discountReason ?? '').trim();
  if (discountAmount > 0 && !discountReason) {
    throw new Error('Informe o motivo do desconto');
  }
  const netTotal = Math.round(Math.max(0, gros - discountAmount) * 100) / 100;
  const amountReceived =
    input.amountReceived === undefined || Number.isNaN(input.amountReceived)
      ? netTotal
      : input.amountReceived;

  const all = listSales();
  const id = newId();
  const soldAt = new Date().toISOString();

  const { warnings, costs } = await applySaleToPatio({
    saleId: id,
    items: input.items.map((i) => ({
      materialId: i.materialId,
      materialName: i.materialName,
      weight: i.weight,
    })),
    at: soldAt,
  });

  const costByMat = new Map(costs.map((c) => [c.materialId, c.avgCost]));
  const scale = gros > 0 ? netTotal / gros : 1;

  const items: SaleItem[] = input.items.map((i) => {
    const avg = costByMat.get(i.materialId) ?? getAvgCost(i.materialId);
    const line = lineTotal(i.weight, i.unitPrice);
    const netLine = Math.round(line * scale * 100) / 100;
    const netUnit = i.weight > 0 ? netLine / i.weight : i.unitPrice;
    const grossProfit = Math.round((netUnit - avg) * i.weight * 100) / 100;
    return {
      id: newId(),
      materialId: i.materialId,
      materialName: i.materialName,
      weight: i.weight,
      unitPrice: i.unitPrice,
      lineTotal: line,
      avgCostAtSale: avg,
      grossProfit,
      buyPriceRef: i.buyPriceRef ?? avg,
    };
  });

  const grossProfit =
    Math.round(items.reduce((a, i) => a + i.grossProfit, 0) * 100) / 100;

  const methodLabel = input.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro';
  const record: SaleRecord = {
    id,
    documentNumber: `V-${String(all.length + 1).padStart(6, '0')}`,
    soldAt,
    customerName: input.customerName,
    notes: input.notes,
    items,
    grossTotal: gros,
    discountAmount,
    discountReason,
    netTotal,
    amountReceived,
    paymentMethod: input.paymentMethod,
    receivedBy,
    grossProfit,
    status: 'FINALIZED',
    comments: [],
    cashPosted: false,
    stockWarnings: warnings,
  };

  const detail = formatItemsSummary(items);
  const { cash, created } = await ensureOpenCash({ openedBy: input.openedBy });
  await addCashMovement(cash.id, {
    movementType: 'VENDA_RECEBIDA',
    amount: amountReceived,
    paymentMethod: input.paymentMethod,
    description: `Venda ${record.documentNumber} — ${record.customerName} · ${methodLabel} · recebeu: ${receivedBy}`,
    refType: 'SALE',
    refId: record.id,
    detail,
    movedAt: record.soldAt,
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
    stockWarnings: warnings,
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
  sale.comments = sale.comments ?? [];
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
