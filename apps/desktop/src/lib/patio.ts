import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';

export type PatioMovement = {
  id: string;
  materialId: string;
  materialName: string;
  kind: 'IN' | 'OUT';
  weight: number;
  unitCost: number;
  sourceType: 'PURCHASE' | 'SALE' | 'ADJUSTMENT';
  sourceId: string;
  at: string;
  notes?: string;
};

export type PatioBalance = {
  materialId: string;
  materialName: string;
  weight: number;
  avgCost: number;
  stockValue: number;
};

/** Lote de compra ainda com kg no pátio (FIFO). */
export type PurchaseLotBalance = {
  purchaseId: string;
  movementId: string;
  materialId: string;
  materialName: string;
  documentNumber: string;
  purchasedAt: string;
  supplierName: string;
  unitCost: number;
  remainingKg: number;
};

const KEY = 'patio-movements';

function listMovements(): PatioMovement[] {
  return loadJson<PatioMovement[]>(KEY, []).sort((a, b) =>
    b.at.localeCompare(a.at),
  );
}

function persist(all: PatioMovement[]) {
  saveJson(KEY, all);
}

/** Weighted average cost for a material from ledger. */
export function getPatioBalances(): PatioBalance[] {
  const byMat = new Map<
    string,
    { name: string; weight: number; value: number }
  >();

  const chronological = [...listMovements()].sort((a, b) =>
    a.at.localeCompare(b.at),
  );

  for (const m of chronological) {
    const cur = byMat.get(m.materialId) ?? {
      name: m.materialName,
      weight: 0,
      value: 0,
    };
    if (m.kind === 'IN') {
      const newWeight = cur.weight + m.weight;
      const newValue = cur.value + m.weight * m.unitCost;
      byMat.set(m.materialId, {
        name: m.materialName,
        weight: Math.round(newWeight * 1000) / 1000,
        value: Math.round(newValue * 100) / 100,
      });
    } else {
      const avg = cur.weight > 0 ? cur.value / cur.weight : m.unitCost;
      const outW = Math.min(m.weight, cur.weight);
      const newWeight = Math.max(0, cur.weight - m.weight);
      const newValue = Math.max(0, cur.value - outW * avg);
      byMat.set(m.materialId, {
        name: m.materialName,
        weight: Math.round(newWeight * 1000) / 1000,
        value: Math.round(newValue * 100) / 100,
      });
    }
  }

  return [...byMat.entries()]
    .map(([materialId, v]) => ({
      materialId,
      materialName: v.name,
      weight: v.weight,
      avgCost: v.weight > 0 ? Math.round((v.value / v.weight) * 10000) / 10000 : 0,
      stockValue: v.value,
    }))
    .filter((b) => b.weight > 0.0005 || b.stockValue > 0.009)
    .sort((a, b) => a.materialName.localeCompare(b.materialName, 'pt-BR'));
}

export function getMaterialBalance(materialId: string): PatioBalance | undefined {
  return getPatioBalances().find((b) => b.materialId === materialId);
}

export function getAvgCost(materialId: string): number {
  return getMaterialBalance(materialId)?.avgCost ?? 0;
}

export async function applyPurchaseToPatio(input: {
  purchaseId: string;
  items: Array<{
    materialId: string;
    materialName: string;
    weight: number;
    unitPrice: number;
  }>;
  at?: string;
}) {
  const all = listMovements();
  const at = input.at ?? new Date().toISOString();
  for (const item of input.items) {
    const row: PatioMovement = {
      id: newId(),
      materialId: item.materialId,
      materialName: item.materialName,
      kind: 'IN',
      weight: item.weight,
      unitCost: item.unitPrice,
      sourceType: 'PURCHASE',
      sourceId: input.purchaseId,
      at,
    };
    all.unshift(row);
    await enqueueSyncOp({
      entityType: 'PatioMovement',
      entityId: row.id,
      action: 'CREATE',
      payload: row as unknown as Record<string, unknown>,
    });
  }
  persist(all);
}

export async function applySaleToPatio(input: {
  saleId: string;
  items: Array<{
    materialId: string;
    materialName: string;
    weight: number;
  }>;
  at?: string;
}): Promise<{
  warnings: string[];
  costs: Array<{ materialId: string; avgCost: number; weight: number }>;
}> {
  const warnings: string[] = [];
  const costs: Array<{ materialId: string; avgCost: number; weight: number }> =
    [];
  const all = listMovements();
  const at = input.at ?? new Date().toISOString();

  for (const item of input.items) {
    const bal = getMaterialBalance(item.materialId);
    const available = bal?.weight ?? 0;
    const avgCost = bal?.avgCost ?? 0;
    if (item.weight > available + 0.0005) {
      warnings.push(
        `${item.materialName}: pediu ${item.weight} kg, pátio tem ${available.toFixed(3)} kg (venda registrada mesmo assim).`,
      );
    }
    costs.push({ materialId: item.materialId, avgCost, weight: item.weight });
    const row: PatioMovement = {
      id: newId(),
      materialId: item.materialId,
      materialName: item.materialName,
      kind: 'OUT',
      weight: item.weight,
      unitCost: avgCost,
      sourceType: 'SALE',
      sourceId: input.saleId,
      at,
    };
    all.unshift(row);
    await enqueueSyncOp({
      entityType: 'PatioMovement',
      entityId: row.id,
      action: 'CREATE',
      payload: row as unknown as Record<string, unknown>,
    });
    persist(all);
  }
  return { warnings, costs };
}

/**
 * Baixa parcial ligada a uma compra: OUT ADJUSTMENT (não apaga o IN).
 * Saldo do lote = IN − OUTs ADJUSTMENT do mesmo purchaseId+material.
 */
export async function applyAdjustmentOut(input: {
  purchaseId: string;
  materialId: string;
  materialName: string;
  weight: number;
  unitCost: number;
  reason?: string;
  at?: string;
}): Promise<PatioMovement> {
  const weight = Math.round(input.weight * 1000) / 1000;
  if (!(weight > 0)) throw new Error('Informe um peso válido para a baixa.');

  const lot = listPurchaseLotsByMaterial(input.materialId).find(
    (l) => l.purchaseId === input.purchaseId,
  );
  if (!lot || lot.remainingKg + 0.0005 < weight) {
    throw new Error(
      `Peso maior que o disponível nesta compra (${(lot?.remainingKg ?? 0).toFixed(3)} kg).`,
    );
  }

  const all = listMovements();
  const row: PatioMovement = {
    id: newId(),
    materialId: input.materialId,
    materialName: input.materialName,
    kind: 'OUT',
    weight,
    unitCost: input.unitCost,
    sourceType: 'ADJUSTMENT',
    sourceId: input.purchaseId,
    at: input.at ?? new Date().toISOString(),
    notes: input.reason?.trim() || undefined,
  };
  all.unshift(row);
  persist(all);
  await enqueueSyncOp({
    entityType: 'PatioMovement',
    entityId: row.id,
    action: 'CREATE',
    payload: row as unknown as Record<string, unknown>,
  });
  return row;
}

/** Lotes FIFO com kg restante por compra+material. */
export function listPurchaseLotsByMaterial(
  materialId: string,
): PurchaseLotBalance[] {
  const all = listMovements();
  const ins = all
    .filter(
      (m) =>
        m.kind === 'IN' &&
        m.sourceType === 'PURCHASE' &&
        m.materialId === materialId,
    )
    .sort((a, b) => a.at.localeCompare(b.at));

  const lots: PurchaseLotBalance[] = [];
  for (const inn of ins) {
    const taken = all
      .filter(
        (m) =>
          m.kind === 'OUT' &&
          m.sourceType === 'ADJUSTMENT' &&
          m.sourceId === inn.sourceId &&
          m.materialId === materialId,
      )
      .reduce((acc, m) => acc + m.weight, 0);
    const remainingKg = Math.round((inn.weight - taken) * 1000) / 1000;
    if (remainingKg <= 0.0005) continue;
    const purchases = loadJson<
      Array<{
        id: string;
        documentNumber?: string;
        purchasedAt?: string;
        supplierName?: string;
      }>
    >('purchases', []);
    const purchase = purchases.find((p) => p.id === inn.sourceId);
    lots.push({
      purchaseId: inn.sourceId,
      movementId: inn.id,
      materialId: inn.materialId,
      materialName: inn.materialName,
      documentNumber: purchase?.documentNumber ?? '—',
      purchasedAt: purchase?.purchasedAt ?? inn.at,
      supplierName: purchase?.supplierName ?? '—',
      unitCost: inn.unitCost,
      remainingKg,
    });
  }
  return lots;
}

export function listPatioMovements(limit?: number): PatioMovement[] {
  const all = listMovements();
  if (limit === undefined || limit <= 0) return all;
  return all.slice(0, limit);
}

export type PatioMaterialPeriod = {
  materialId: string;
  materialName: string;
  inKg: number;
  outKg: number;
  netKg: number;
  inValue: number;
  outValue: number;
};

export type PatioReportSummary = {
  count: number;
  inKg: number;
  outKg: number;
  inValue: number;
  outValue: number;
  byMaterial: PatioMaterialPeriod[];
};

export function sumPatioMovements(rows: PatioMovement[]): PatioReportSummary {
  const byMat = new Map<string, PatioMaterialPeriod>();
  let inKg = 0;
  let outKg = 0;
  let inValue = 0;
  let outValue = 0;

  for (const m of rows) {
    const cur = byMat.get(m.materialId) ?? {
      materialId: m.materialId,
      materialName: m.materialName,
      inKg: 0,
      outKg: 0,
      netKg: 0,
      inValue: 0,
      outValue: 0,
    };
    const value = m.weight * m.unitCost;
    if (m.kind === 'IN') {
      cur.inKg += m.weight;
      cur.inValue += value;
      inKg += m.weight;
      inValue += value;
    } else {
      cur.outKg += m.weight;
      cur.outValue += value;
      outKg += m.weight;
      outValue += value;
    }
    cur.netKg = Math.round((cur.inKg - cur.outKg) * 1000) / 1000;
    byMat.set(m.materialId, cur);
  }

  return {
    count: rows.length,
    inKg: Math.round(inKg * 1000) / 1000,
    outKg: Math.round(outKg * 1000) / 1000,
    inValue: Math.round(inValue * 100) / 100,
    outValue: Math.round(outValue * 100) / 100,
    byMaterial: [...byMat.values()].sort((a, b) =>
      a.materialName.localeCompare(b.materialName, 'pt-BR'),
    ),
  };
}

/** Remove IN de compra e OUTs ADJUSTMENT ligados a ela. */
export async function removePurchaseFromPatio(purchaseId: string) {
  const all = listMovements();
  const keep: PatioMovement[] = [];
  const removed: PatioMovement[] = [];
  for (const m of all) {
    const linked =
      m.sourceId === purchaseId &&
      (m.sourceType === 'PURCHASE' || m.sourceType === 'ADJUSTMENT');
    if (linked) removed.push(m);
    else keep.push(m);
  }
  if (removed.length === 0) return;
  persist(keep);
  for (const row of removed) {
    await enqueueSyncOp({
      entityType: 'PatioMovement',
      entityId: row.id,
      action: 'DELETE',
      payload: { id: row.id, sourceId: purchaseId },
    });
  }
}

/** Exclui só uma baixa manual (ADJUSTMENT OUT). */
export async function deleteAdjustmentMovement(movementId: string) {
  const all = listMovements();
  const row = all.find((m) => m.id === movementId);
  if (!row) throw new Error('Movimento não encontrado');
  if (!(row.kind === 'OUT' && row.sourceType === 'ADJUSTMENT')) {
    throw new Error(
      'Só dá para excluir baixas manuais. Ajuste entradas pela compra.',
    );
  }
  const keep = all.filter((m) => m.id !== movementId);
  persist(keep);
  await enqueueSyncOp({
    entityType: 'PatioMovement',
    entityId: movementId,
    action: 'DELETE',
    payload: { id: movementId },
  });
}
