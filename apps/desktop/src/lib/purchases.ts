import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import { lineTotal } from './materials';
import { ensureOpenCash, addCashMovement } from './cash';
import { applyPurchaseToPatio } from './patio';
import { formatItemsSummary } from './item-summary';

export type PurchaseItem = {
  id: string;
  materialId: string;
  materialName: string;
  weight: number;
  unitPrice: number;
  lineTotal: number;
};

export type PurchaseRecord = {
  id: string;
  documentNumber: string;
  purchasedAt: string;
  supplierName: string;
  documentId: string;
  paymentMethod: string;
  notes: string;
  items: PurchaseItem[];
  netTotal: number;
  amountPaid: number;
  status: string;
  cashPosted: boolean;
};

const KEY = 'purchases';

export function listPurchases(): PurchaseRecord[] {
  return loadJson<PurchaseRecord[]>(KEY, [])
    .map((p) => ({
      ...p,
      items: p.items ?? [],
      amountPaid: p.amountPaid ?? p.netTotal,
      cashPosted: p.cashPosted ?? false,
      documentId: p.documentId ?? '',
      paymentMethod: p.paymentMethod ?? 'DINHEIRO',
    }))
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

export function getPurchase(id: string): PurchaseRecord | undefined {
  return listPurchases().find((p) => p.id === id);
}

export async function createPurchase(input: {
  supplierName: string;
  documentId?: string;
  paymentMethod?: string;
  notes: string;
  items: Array<{
    materialId: string;
    materialName: string;
    weight: number;
    unitPrice: number;
  }>;
  amountPaid?: number;
  openedBy: string;
}): Promise<{ purchase: PurchaseRecord; cashInfo?: string }> {
  if (!input.items.length) throw new Error('Adicione ao menos um material na compra');

  const items: PurchaseItem[] = input.items.map((i) => ({
    id: newId(),
    materialId: i.materialId,
    materialName: i.materialName,
    weight: i.weight,
    unitPrice: i.unitPrice,
    lineTotal: lineTotal(i.weight, i.unitPrice),
  }));
  const netTotal =
    Math.round(items.reduce((acc, i) => acc + i.lineTotal, 0) * 100) / 100;
  const amountPaid =
    input.amountPaid === undefined || Number.isNaN(input.amountPaid)
      ? netTotal
      : input.amountPaid;

  const all = listPurchases();
  const record: PurchaseRecord = {
    id: newId(),
    documentNumber: `C-${String(all.length + 1).padStart(6, '0')}`,
    purchasedAt: new Date().toISOString(),
    supplierName: input.supplierName.trim() || 'Pessoa',
    documentId: (input.documentId ?? '').trim(),
    paymentMethod: input.paymentMethod ?? 'DINHEIRO',
    notes: input.notes,
    items,
    netTotal,
    amountPaid,
    status: 'FINALIZED',
    cashPosted: false,
  };

  const detail = formatItemsSummary(items);
  const { cash, created } = await ensureOpenCash({ openedBy: input.openedBy });
  await addCashMovement(cash.id, {
    movementType: 'COMPRA_PAGA',
    amount: amountPaid,
    description: `Compra ${record.documentNumber} — ${record.supplierName}`,
    paymentMethod: record.paymentMethod,
    refType: 'PURCHASE',
    refId: record.id,
    detail,
    movedAt: record.purchasedAt,
  });
  record.cashPosted = true;

  await applyPurchaseToPatio({
    purchaseId: record.id,
    items: items.map((i) => ({
      materialId: i.materialId,
      materialName: i.materialName,
      weight: i.weight,
      unitPrice: i.unitPrice,
    })),
    at: record.purchasedAt,
  });

  all.unshift(record);
  saveJson(KEY, all);
  await enqueueSyncOp({
    entityType: 'Purchase',
    entityId: record.id,
    action: 'CREATE',
    payload: record as unknown as Record<string, unknown>,
  });

  return {
    purchase: record,
    cashInfo: created
      ? 'Caixa aberto automaticamente para registrar a compra.'
      : undefined,
  };
}
