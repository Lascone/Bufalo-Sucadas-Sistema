import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import { lineTotal } from './materials';
import {
  addCashMovement,
  deleteCashMovement,
  ensureOpenCash,
  getOpenCash,
  listCashRegisters,
  setCashMovementVoided,
  updateCashMovement,
} from './cash';
import {
  applyAdjustmentOut,
  applyPurchaseToPatio,
  getMaterialBalance,
  listPurchaseLotsByMaterial,
  removePurchaseFromPatio,
} from './patio';
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
  /** Who registered the purchase (operator). */
  createdBy: string;
  /** Anulado: permanece na lista, fora de qualquer cálculo. */
  voidedAt?: string;
  voidReason?: string;
  voidedBy?: string;
};

const KEY = 'purchases';

function safeIso(v: unknown, fallback = ''): string {
  if (typeof v === 'string' && v.trim()) return v;
  return fallback;
}

export function listPurchases(): PurchaseRecord[] {
  const raw = loadJson<PurchaseRecord[] | null>(KEY, []);
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((p): p is PurchaseRecord => !!p && typeof p === 'object' && !!p.id)
    .map((p) => ({
      ...p,
      id: String(p.id),
      documentNumber: String(p.documentNumber ?? ''),
      purchasedAt: safeIso(p.purchasedAt, '1970-01-01T00:00:00.000Z'),
      supplierName: String(p.supplierName ?? ''),
      documentId: String(p.documentId ?? ''),
      paymentMethod: String(p.paymentMethod ?? 'DINHEIRO'),
      notes: String(p.notes ?? ''),
      items: Array.isArray(p.items) ? p.items : [],
      netTotal: Number(p.netTotal) || 0,
      amountPaid: Number(p.amountPaid ?? p.netTotal) || 0,
      status: String(p.status ?? 'POSTED'),
      cashPosted: p.cashPosted ?? false,
      createdBy: String(p.createdBy ?? ''),
    }))
    .sort((a, b) =>
      (b.purchasedAt || '').localeCompare(a.purchasedAt || ''),
    );
}

export function getPurchase(id: string): PurchaseRecord | undefined {
  if (!id) return undefined;
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
  /** Who launched this purchase (operator name). */
  createdBy?: string;
  /** Override timestamp (backfill from paper). */
  purchasedAt?: string;
}): Promise<{ purchase: PurchaseRecord; cashInfo?: string }> {
  if (!input.items.length) throw new Error('Adicione ao menos um material na compra');

  let purchasedAt = input.purchasedAt?.trim()
    ? new Date(input.purchasedAt).toISOString()
    : new Date().toISOString();
  const purchasedMs = new Date(purchasedAt).getTime();
  if (!Number.isFinite(purchasedMs)) {
    throw new Error('Data da compra inválida.');
  }
  const now = Date.now();
  if (purchasedMs > now + 60 * 60 * 1000) {
    throw new Error('Data da compra não pode ser mais de 1 hora no futuro.');
  }

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

  const createdBy = (input.createdBy ?? input.openedBy ?? '').trim();

  const all = listPurchases();
  const record: PurchaseRecord = {
    id: newId(),
    documentNumber: `C-${String(all.length + 1).padStart(6, '0')}`,
    purchasedAt,
    supplierName: input.supplierName.trim() || 'Pessoa',
    documentId: (input.documentId ?? '').trim(),
    paymentMethod: input.paymentMethod ?? 'DINHEIRO',
    notes: input.notes,
    items,
    netTotal,
    amountPaid,
    status: 'FINALIZED',
    cashPosted: false,
    createdBy,
  };

  const detail = [
    formatItemsSummary(items),
    createdBy ? `por ${createdBy}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const { cash, created } = await ensureOpenCash({ openedBy: input.openedBy });
  await addCashMovement(cash.id, {
    movementType: 'COMPRA_PAGA',
    amount: amountPaid,
    description: `Material comprado ${record.documentNumber} — ${record.supplierName}`,
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

/** Exclui compra: tira do caixa aberto, desfaz pátio e remove o registro. */
export async function deletePurchase(purchaseId: string) {
  const all = listPurchases();
  const idx = all.findIndex((p) => p.id === purchaseId);
  if (idx < 0) throw new Error('Compra não encontrada');

  const cash = getOpenCash();
  if (cash) {
    const mov = cash.movements.find(
      (m) => m.refType === 'PURCHASE' && m.refId === purchaseId,
    );
    if (mov) {
      await deleteCashMovement(cash.id, mov.id);
    }
  }

  await removePurchaseFromPatio(purchaseId);

  all.splice(idx, 1);
  saveJson(KEY, all);
  await enqueueSyncOp({
    entityType: 'Purchase',
    entityId: purchaseId,
    action: 'DELETE',
    payload: { id: purchaseId },
  });
}

/**
 * Baixa no pátio ligada à compra: reduz item/valor da compra, ajusta caixa
 * se aberto, e cria OUT ADJUSTMENT no ledger do pátio.
 */
export async function reducePurchaseStock(input: {
  purchaseId: string;
  materialId: string;
  weight: number;
  reason?: string;
  operator?: string;
}): Promise<{
  purchase: PurchaseRecord | null;
  deleted: boolean;
  reducedKg: number;
  refundValue: number;
}> {
  const weight = Math.round(Number(input.weight) * 1000) / 1000;
  if (!(weight > 0)) throw new Error('Informe um peso válido.');

  const lots = listPurchaseLotsByMaterial(input.materialId);
  const lot = lots.find((l) => l.purchaseId === input.purchaseId);
  if (!lot) {
    throw new Error('Não há saldo deste material nesta compra no pátio.');
  }
  if (weight > lot.remainingKg + 0.0005) {
    throw new Error(
      `Só há ${lot.remainingKg.toFixed(3)} kg restantes nesta compra.`,
    );
  }

  const all = listPurchases();
  const idx = all.findIndex((p) => p.id === input.purchaseId);
  if (idx < 0) throw new Error('Compra não encontrada');
  const purchase = { ...all[idx]!, items: [...(all[idx]!.items ?? [])] };

  const itemIdx = purchase.items.findIndex(
    (i) => i.materialId === input.materialId,
  );
  if (itemIdx < 0) {
    throw new Error('Material não está nesta compra.');
  }
  const item = { ...purchase.items[itemIdx]! };
  if (weight > item.weight + 0.0005) {
    throw new Error(
      `Compra tem só ${item.weight.toFixed(3)} kg deste material.`,
    );
  }

  const refundValue =
    Math.round(weight * item.unitPrice * 100) / 100;
  const reason =
    input.reason?.trim() ||
    `Baixa pátio ${weight.toFixed(3)} kg${input.operator ? ` · ${input.operator}` : ''}`;

  await applyAdjustmentOut({
    purchaseId: purchase.id,
    materialId: item.materialId,
    materialName: item.materialName,
    weight,
    unitCost: item.unitPrice,
    reason,
  });

  const newItemWeight = Math.round((item.weight - weight) * 1000) / 1000;
  if (newItemWeight <= 0.0005) {
    purchase.items.splice(itemIdx, 1);
  } else {
    item.weight = newItemWeight;
    item.lineTotal = lineTotal(item.weight, item.unitPrice);
    purchase.items[itemIdx] = item;
  }

  if (purchase.items.length === 0) {
    await deletePurchase(purchase.id);
    return {
      purchase: null,
      deleted: true,
      reducedKg: weight,
      refundValue,
    };
  }

  purchase.netTotal =
    Math.round(purchase.items.reduce((acc, i) => acc + i.lineTotal, 0) * 100) /
    100;
  // Mantém proporção do pago → novo total
  purchase.amountPaid = purchase.netTotal;
  const noteLine = `${new Date().toLocaleString('pt-BR')}: ${reason}`;
  purchase.notes = purchase.notes
    ? `${purchase.notes}\n${noteLine}`
    : noteLine;

  all[idx] = purchase;
  saveJson(KEY, all);

  const cash = getOpenCash();
  if (cash) {
    const mov = cash.movements.find(
      (m) => m.refType === 'PURCHASE' && m.refId === purchase.id,
    );
    if (mov) {
      const detail = [
        formatItemsSummary(purchase.items),
        purchase.createdBy ? `por ${purchase.createdBy}` : '',
        reason,
      ]
        .filter(Boolean)
        .join(' · ');
      await updateCashMovement(cash.id, mov.id, {
        amount: purchase.amountPaid,
        description: `Material comprado ${purchase.documentNumber} — ${purchase.supplierName}`,
        detail,
      });
    }
  }

  await enqueueSyncOp({
    entityType: 'Purchase',
    entityId: purchase.id,
    action: 'UPDATE',
    payload: purchase as unknown as Record<string, unknown>,
    version: 2,
  });

  return {
    purchase,
    deleted: false,
    reducedKg: weight,
    refundValue,
  };
}

/** Kg disponível para baixa FIFO: menor entre lotes e saldo do pátio. */
export function availableFifoKg(materialId: string): number {
  const lots = listPurchaseLotsByMaterial(materialId);
  const lotSum =
    Math.round(lots.reduce((a, l) => a + l.remainingKg, 0) * 1000) / 1000;
  const patioW = getMaterialBalance(materialId)?.weight ?? 0;
  if (lotSum <= 0) return 0;
  if (patioW <= 0) return lotSum;
  return Math.round(Math.min(lotSum, patioW) * 1000) / 1000;
}

/**
 * Baixa N kg do material, do lote mais antigo ao mais novo (FIFO),
 * até chegar o mais perto possível da quantidade pedida.
 */
export async function reduceMaterialStockFifo(input: {
  materialId: string;
  weight: number;
  reason?: string;
  operator?: string;
}): Promise<{
  reducedKg: number;
  refundValue: number;
  targetKg: number;
  availableKg: number;
  lotsTouched: Array<{ purchaseId: string; kg: number; deleted: boolean }>;
}> {
  const target = Math.round(Number(input.weight) * 1000) / 1000;
  if (!(target > 0)) throw new Error('Informe um peso válido.');

  const available = availableFifoKg(input.materialId);
  if (available <= 0.0005) {
    throw new Error('Não há kg disponível deste material no pátio.');
  }

  let need = Math.min(target, available);
  const reasonBase =
    input.reason?.trim() ||
    `Baixa FIFO ${target.toFixed(3)} kg${
      input.operator ? ` · ${input.operator}` : ''
    }`;

  const lotsTouched: Array<{
    purchaseId: string;
    kg: number;
    deleted: boolean;
  }> = [];
  let reducedKg = 0;
  let refundValue = 0;

  while (need > 0.0005) {
    const lots = listPurchaseLotsByMaterial(input.materialId);
    const lot = lots[0];
    if (!lot) break;
    const take = Math.round(Math.min(need, lot.remainingKg) * 1000) / 1000;
    if (take <= 0.0005) break;
    const r = await reducePurchaseStock({
      purchaseId: lot.purchaseId,
      materialId: input.materialId,
      weight: take,
      reason: reasonBase,
      operator: input.operator,
    });
    lotsTouched.push({
      purchaseId: lot.purchaseId,
      kg: r.reducedKg,
      deleted: r.deleted,
    });
    reducedKg = Math.round((reducedKg + r.reducedKg) * 1000) / 1000;
    refundValue = Math.round((refundValue + r.refundValue) * 100) / 100;
    need = Math.round((need - r.reducedKg) * 1000) / 1000;
  }

  if (reducedKg <= 0.0005) {
    throw new Error('Não foi possível baixar kg deste material.');
  }

  return {
    reducedKg,
    refundValue,
    targetKg: target,
    availableKg: available,
    lotsTouched,
  };
}

/** Zera o material no pátio (todos os lotes FIFO até o saldo disponível). */
export async function zeroMaterialPurchaseLots(input: {
  materialId: string;
  reason?: string;
  operator?: string;
}): Promise<{
  reducedKg: number;
  refundValue: number;
  targetKg: number;
  availableKg: number;
  lotsTouched: Array<{ purchaseId: string; kg: number; deleted: boolean }>;
}> {
  const available = availableFifoKg(input.materialId);
  if (available <= 0.0005) {
    throw new Error('Material já está zerado no pátio.');
  }
  return reduceMaterialStockFifo({
    materialId: input.materialId,
    weight: available,
    reason:
      input.reason?.trim() ||
      `Zerar material${input.operator ? ` · ${input.operator}` : ''}`,
    operator: input.operator,
  });
}

/**
 * Desfaz uma baixa manual: devolve kg à compra e remove o OUT ADJUSTMENT.
 */
export async function undoPurchaseStockAdjustment(movementId: string) {
  const { listPatioMovements, deleteAdjustmentMovement } = await import(
    './patio'
  );
  const mov = listPatioMovements().find((m) => m.id === movementId);
  if (!mov || !(mov.kind === 'OUT' && mov.sourceType === 'ADJUSTMENT')) {
    throw new Error('Baixa manual não encontrada.');
  }

  const all = listPurchases();
  const idx = all.findIndex((p) => p.id === mov.sourceId);
  if (idx < 0) {
    await deleteAdjustmentMovement(movementId);
    return;
  }

  const purchase = { ...all[idx]!, items: [...(all[idx]!.items ?? [])] };
  const itemIdx = purchase.items.findIndex(
    (i) => i.materialId === mov.materialId,
  );
  if (itemIdx >= 0) {
    const item = { ...purchase.items[itemIdx]! };
    item.weight = Math.round((item.weight + mov.weight) * 1000) / 1000;
    item.lineTotal = lineTotal(item.weight, item.unitPrice);
    purchase.items[itemIdx] = item;
  } else {
    purchase.items.push({
      id: newId(),
      materialId: mov.materialId,
      materialName: mov.materialName,
      weight: mov.weight,
      unitPrice: mov.unitCost,
      lineTotal: lineTotal(mov.weight, mov.unitCost),
    });
  }
  purchase.netTotal =
    Math.round(purchase.items.reduce((acc, i) => acc + i.lineTotal, 0) * 100) /
    100;
  purchase.amountPaid = purchase.netTotal;
  const noteLine = `${new Date().toLocaleString('pt-BR')}: desfez baixa ${mov.weight.toFixed(3)} kg`;
  purchase.notes = purchase.notes
    ? `${purchase.notes}\n${noteLine}`
    : noteLine;

  all[idx] = purchase;
  saveJson(KEY, all);
  await deleteAdjustmentMovement(movementId);

  const cash = getOpenCash();
  if (cash) {
    const cm = cash.movements.find(
      (m) => m.refType === 'PURCHASE' && m.refId === purchase.id,
    );
    if (cm) {
      await updateCashMovement(cash.id, cm.id, {
        amount: purchase.amountPaid,
        description: `Material comprado ${purchase.documentNumber} — ${purchase.supplierName}`,
        detail: formatItemsSummary(purchase.items),
      });
    }
  }

  await enqueueSyncOp({
    entityType: 'Purchase',
    entityId: purchase.id,
    action: 'UPDATE',
    payload: purchase as unknown as Record<string, unknown>,
    version: 2,
  });
}

export async function setPurchaseVoided(input: {
  purchaseId: string;
  voided: boolean;
  reason?: string;
  voidedBy?: string;
}) {
  const all = listPurchases();
  const idx = all.findIndex((p) => p.id === input.purchaseId);
  if (idx < 0) throw new Error('Compra não encontrada');
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
  saveJson(KEY, all);
  await enqueueSyncOp({
    entityType: 'Purchase',
    entityId: input.purchaseId,
    action: 'UPDATE',
    payload: all[idx] as unknown as Record<string, unknown>,
    version: 2,
  });

  for (const cash of listCashRegisters()) {
    for (const m of cash.movements) {
      if (m.refType !== 'PURCHASE' || m.refId !== input.purchaseId) continue;
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

