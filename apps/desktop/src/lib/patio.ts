import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';

export type PatioMovement = {
  id: string;
  materialId: string;
  materialName: string;
  kind: 'IN' | 'OUT';
  weight: number;
  unitCost: number;
  sourceType: 'PURCHASE' | 'SALE';
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

  // Process oldest first for average
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
      // OUT uses current avg; reduce weight and proportional value
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
}): Promise<{ warnings: string[]; costs: Array<{ materialId: string; avgCost: number; weight: number }> }> {
  const warnings: string[] = [];
  const costs: Array<{ materialId: string; avgCost: number; weight: number }> = [];
  const all = listMovements();
  const at = input.at ?? new Date().toISOString();

  for (const item of input.items) {
    // Snapshot before this OUT (from persisted ledger only)
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
    // Persist incrementally so subsequent items of same material see updated stock
    persist(all);
  }
  return { warnings, costs };
}

export function listPatioMovements(limit = 50): PatioMovement[] {
  return listMovements().slice(0, limit);
}
