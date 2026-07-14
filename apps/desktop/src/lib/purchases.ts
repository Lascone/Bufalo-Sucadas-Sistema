import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import { lineTotal } from './materials';

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
  notes: string;
  items: PurchaseItem[];
  netTotal: number;
  status: string;
};

const KEY = 'purchases';

export function listPurchases(): PurchaseRecord[] {
  return loadJson<PurchaseRecord[]>(KEY, []).sort((a, b) =>
    b.purchasedAt.localeCompare(a.purchasedAt),
  );
}

export async function createPurchase(input: {
  supplierName: string;
  notes: string;
  items: Array<{
    materialId: string;
    materialName: string;
    weight: number;
    unitPrice: number;
  }>;
}): Promise<PurchaseRecord> {
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

  const all = listPurchases();
  const record: PurchaseRecord = {
    id: newId(),
    documentNumber: `C-${String(all.length + 1).padStart(6, '0')}`,
    purchasedAt: new Date().toISOString(),
    supplierName: input.supplierName,
    notes: input.notes,
    items,
    netTotal,
    status: 'FINALIZED',
  };
  all.unshift(record);
  saveJson(KEY, all);
  await enqueueSyncOp({
    entityType: 'Purchase',
    entityId: record.id,
    action: 'CREATE',
    payload: record as unknown as Record<string, unknown>,
  });
  return record;
}
