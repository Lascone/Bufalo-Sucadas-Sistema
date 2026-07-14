import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import { ensureOpenCash, addCashMovement } from './cash';
import { getAvgCost } from './patio';
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
  /** Soma dos itens antes do desconto / valor do lote */
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
  /** Venda por valor negociado (sem peso/kg) */
  lotSale?: boolean;
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
        lotSale: s.lotSale ?? items.every((i) => !i.weight),
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

function materialsLabel(
  items: Array<{ materialName: string; weight: number }>,
): string {
  const names = [...new Set(items.map((i) => i.materialName))];
  if (items.every((i) => !i.weight || i.weight <= 0)) {
    return names.join(' · ');
  }
  return formatItemsSummary(items);
}

/**
 * Venda simples (lote): material(is) + empresa + valor + PIX/dinheiro + quem recebeu.
 * Não exige peso/preço por kg; pátio não é baixado automaticamente.
 */
export async function createSale(input: {
  customerName: string;
  notes?: string;
  materials: Array<{
    materialId: string;
    materialName: string;
    buyPriceRef?: number;
  }>;
  paymentMethod: SalePaymentMethod;
  receivedBy: string;
  /** Valor negociado do lote (R$) */
  amount: number;
  discountAmount?: number;
  discountReason?: string;
  openedBy: string;
}): Promise<{ sale: SaleRecord; cashInfo?: string; stockWarnings: string[] }> {
  if (!input.materials.length) {
    throw new Error('Escolha o material vendido (ex.: Alumínio)');
  }
  if (input.paymentMethod !== 'PIX' && input.paymentMethod !== 'DINHEIRO') {
    throw new Error('Informe se recebeu em PIX ou dinheiro');
  }
  const receivedBy = input.receivedBy.trim();
  if (!receivedBy) throw new Error('Informe quem recebeu (sócio)');

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Informe o valor da venda (R$)');
  }

  const discountRaw = Number(input.discountAmount) || 0;
  if (discountRaw < 0) throw new Error('Desconto inválido');
  const discountAmount = Math.round(Math.min(discountRaw, amount) * 100) / 100;
  const discountReason = (input.discountReason ?? '').trim();
  if (discountAmount > 0 && !discountReason) {
    throw new Error('Informe o motivo do desconto');
  }

  const grossTotal = Math.round(amount * 100) / 100;
  const netTotal = Math.round(Math.max(0, grossTotal - discountAmount) * 100) / 100;
  const amountReceived = netTotal;

  const all = listSales();
  const id = newId();
  const soldAt = new Date().toISOString();

  // Sem peso: não mexe no pátio (venda por valor negociado)
  const warnings = [
    'Pátio não alterado — venda por valor total (sem peso). Ajuste o estoque no pátio se precisar.',
  ];

  const share = Math.round((netTotal / input.materials.length) * 100) / 100;
  let allocated = 0;
  const items: SaleItem[] = input.materials.map((m, idx) => {
    const isLast = idx === input.materials.length - 1;
    const line = isLast
      ? Math.round((netTotal - allocated) * 100) / 100
      : share;
    allocated += isLast ? 0 : share;
    const avg = getAvgCost(m.materialId);
    return {
      id: newId(),
      materialId: m.materialId,
      materialName: m.materialName,
      weight: 0,
      unitPrice: 0,
      lineTotal: line,
      avgCostAtSale: avg,
      grossProfit: 0,
      buyPriceRef: m.buyPriceRef ?? avg,
    };
  });

  const methodLabel = input.paymentMethod === 'PIX' ? 'PIX' : 'Dinheiro';
  const record: SaleRecord = {
    id,
    documentNumber: `V-${String(all.length + 1).padStart(6, '0')}`,
    soldAt,
    customerName: input.customerName.trim() || 'Empresa',
    notes: (input.notes ?? '').trim(),
    items,
    grossTotal,
    discountAmount,
    discountReason,
    netTotal,
    amountReceived,
    paymentMethod: input.paymentMethod,
    receivedBy,
    grossProfit: 0,
    status: 'FINALIZED',
    comments: [],
    cashPosted: false,
    stockWarnings: warnings,
    lotSale: true,
  };

  const detail = `${materialsLabel(items)} · ${methodLabel} · ${receivedBy}`;
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
