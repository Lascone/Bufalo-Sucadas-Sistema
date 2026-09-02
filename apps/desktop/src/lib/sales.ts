import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import { ensureOpenCash, addCashMovement, listCashRegisters, setCashMovementVoided } from './cash';
import { applySaleToPatio, getAvgCost } from './patio';
import { formatItemsSummary } from './item-summary';

export type SalePaymentMethod = 'PIX' | 'DINHEIRO';

/** Recebedor especial: dinheiro físico fica no gaveteiro (entra como trocado). */
export const SALE_RECEIVER_CAIXA = 'Caixa';

export function isSaleReceiverCaixa(name: string): boolean {
  return name.trim().toLowerCase() === SALE_RECEIVER_CAIXA.toLowerCase();
}

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
  /** Anulado: permanece na lista, fora de qualquer cálculo. */
  voidedAt?: string;
  voidReason?: string;
  voidedBy?: string;
};

const KEY = 'sales';

export function listSales(): SaleRecord[] {
  const raw = loadJson<SaleRecord[] | null>(KEY, []);
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((s): s is SaleRecord => !!s && typeof s === 'object' && !!s.id)
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
        id: String(s.id),
        soldAt: typeof s.soldAt === 'string' && s.soldAt ? s.soldAt : '1970-01-01T00:00:00.000Z',
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
    .sort((a, b) => (b.soldAt || '').localeCompare(a.soldAt || ''));
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
 * Venda: material(is) + empresa + valor + PIX/dinheiro + quem recebeu.
 * Peso opcional por material — com peso baixa o pátio; sem peso só registra a venda.
 * Só entra no caixa (como trocado) se o recebedor for "Caixa".
 */
export async function createSale(input: {
  customerName: string;
  notes?: string;
  materials: Array<{
    materialId: string;
    materialName: string;
    buyPriceRef?: number;
    /** kg — se > 0, baixa o pátio neste item */
    weight?: number;
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
  if (!receivedBy) throw new Error('Informe quem recebeu (sócio ou Caixa)');

  const toCaixa = isSaleReceiverCaixa(receivedBy);
  if (toCaixa && input.paymentMethod !== 'DINHEIRO') {
    throw new Error(
      'Recebedor Caixa: use forma Dinheiro — o valor entra no gaveteiro como trocado.',
    );
  }

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

  const share = Math.round((netTotal / input.materials.length) * 100) / 100;
  let allocated = 0;
  const items: SaleItem[] = input.materials.map((m, idx) => {
    const isLast = idx === input.materials.length - 1;
    const line = isLast
      ? Math.round((netTotal - allocated) * 100) / 100
      : share;
    allocated += isLast ? 0 : share;
    const weightRaw = Number(m.weight);
    const weight =
      Number.isFinite(weightRaw) && weightRaw > 0
        ? Math.round(weightRaw * 1000) / 1000
        : 0;
    const avg = getAvgCost(m.materialId);
    const unitPrice =
      weight > 0 ? Math.round((line / weight) * 10000) / 10000 : 0;
    const grossProfit =
      weight > 0
        ? Math.round((unitPrice - avg) * weight * 100) / 100
        : 0;
    return {
      id: newId(),
      materialId: m.materialId,
      materialName: m.materialName,
      weight,
      unitPrice,
      lineTotal: line,
      avgCostAtSale: avg,
      grossProfit,
      buyPriceRef: m.buyPriceRef ?? avg,
    };
  });

  const patioItems = items.filter((i) => i.weight > 0);
  const lotSale = patioItems.length === 0;
  let warnings: string[] = [];

  if (patioItems.length > 0) {
    const patio = await applySaleToPatio({
      saleId: id,
      items: patioItems.map((i) => ({
        materialId: i.materialId,
        materialName: i.materialName,
        weight: i.weight,
      })),
      at: soldAt,
    });
    warnings = [...patio.warnings];
    for (const cost of patio.costs) {
      const item = items.find(
        (i) => i.materialId === cost.materialId && i.weight > 0,
      );
      if (!item) continue;
      item.avgCostAtSale = cost.avgCost;
      item.grossProfit =
        Math.round((item.unitPrice - cost.avgCost) * item.weight * 100) / 100;
    }
    if (items.some((i) => i.weight <= 0)) {
      warnings.push(
        'Itens sem peso: valor na venda; pátio baixado só nos materiais com kg.',
      );
    }
  } else {
    warnings = [
      'Pátio não alterado — venda por valor total (sem peso). Ajuste o estoque no pátio se precisar.',
    ];
  }

  const saleGrossProfit =
    Math.round(
      (items.reduce((a, i) => a + i.grossProfit, 0) - discountAmount) * 100,
    ) / 100;

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
    grossProfit: saleGrossProfit,
    status: 'FINALIZED',
    comments: [],
    cashPosted: false,
    stockWarnings: warnings,
    lotSale,
  };

  const detail = `${materialsLabel(items)} · ${methodLabel} · ${receivedBy}`;
  let cashInfo: string | undefined;

  if (toCaixa) {
    const { cash, created } = await ensureOpenCash({ openedBy: input.openedBy });
    await addCashMovement(cash.id, {
      movementType: 'TROCADO',
      amount: amountReceived,
      paymentMethod: 'DINHEIRO',
      description: `Trocado no caixa — venda ${record.documentNumber} — ${record.customerName}`,
      refType: 'SALE',
      refId: record.id,
      detail,
      movedAt: record.soldAt,
    });
    record.cashPosted = true;
    cashInfo = created
      ? 'Caixa aberto automaticamente. Valor entrou como trocado no gaveteiro.'
      : 'Valor entrou no caixa como trocado.';
  }

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
    cashInfo,
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

export async function setSaleVoided(input: {
  saleId: string;
  voided: boolean;
  reason?: string;
  voidedBy?: string;
}) {
  const all = listSales();
  const idx = all.findIndex((s) => s.id === input.saleId);
  if (idx < 0) throw new Error('Venda não encontrada');
  if (input.voided) {
    all[idx] = {
      ...all[idx],
      voidedAt: new Date().toISOString(),
      voidReason: input.reason?.trim() || undefined,
      voidedBy: input.voidedBy?.trim() || undefined,
    };
  } else {
    const next = { ...all[idx] };
    delete next.voidedAt;
    delete next.voidReason;
    delete next.voidedBy;
    all[idx] = next;
  }
  persist(all);
  await enqueueSyncOp({
    entityType: 'Sale',
    entityId: input.saleId,
    action: 'UPDATE',
    payload: all[idx] as unknown as Record<string, unknown>,
    version: 2,
  });

  for (const cash of listCashRegisters()) {
    for (const m of cash.movements) {
      if (m.refType !== 'SALE' || m.refId !== input.saleId) continue;
      const already = Boolean(m.voidedAt);
      if (already === input.voided) continue;
      await setCashMovementVoided({
        movementId: m.id,
        voided: input.voided,
        reason: input.reason,
        voidedBy: input.voidedBy,
      });
    }
  }

  return all[idx];
}
