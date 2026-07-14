import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';

export type MaterialRecord = {
  id: string;
  name: string;
  unit: 'KG' | 'TON' | 'UNIT';
  buyPrice: number;
  sellPrice: number;
  active: boolean;
};

const KEY = 'materials';

const SEED: Omit<MaterialRecord, 'id'>[] = [
  { name: 'Ferro pesado', unit: 'KG', buyPrice: 0.5, sellPrice: 0.65, active: true },
  { name: 'Ferro leve', unit: 'KG', buyPrice: 0.35, sellPrice: 0.5, active: true },
  { name: 'Cobre limpo', unit: 'KG', buyPrice: 32, sellPrice: 38, active: true },
  { name: 'Cobre queimado', unit: 'KG', buyPrice: 26, sellPrice: 31, active: true },
  { name: 'Alumínio limpo', unit: 'KG', buyPrice: 8.5, sellPrice: 10.5, active: true },
  { name: 'Alumínio perfil', unit: 'KG', buyPrice: 7.8, sellPrice: 9.8, active: true },
  { name: 'Sucata mista', unit: 'KG', buyPrice: 0.7, sellPrice: 0.95, active: true },
];

function ensureSeed(): MaterialRecord[] {
  const existing = loadJson<MaterialRecord[] | null>(KEY, null);
  if (existing && existing.length > 0) return existing;
  const seeded = SEED.map((m) => ({ ...m, id: newId() }));
  saveJson(KEY, seeded);
  return seeded;
}

export function listMaterials(activeOnly = false): MaterialRecord[] {
  const all = ensureSeed().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return activeOnly ? all.filter((m) => m.active) : all;
}

export function getMaterial(id: string): MaterialRecord | undefined {
  return listMaterials().find((m) => m.id === id);
}

export function lineTotal(weight: number, unitPrice: number): number {
  const w = Number.isFinite(weight) ? weight : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  return Math.round(w * p * 100) / 100;
}

/** From line total and preço/kg → peso (3 decimal places for kg). */
export function weightFromTotal(total: number, unitPrice: number): number {
  const t = Number.isFinite(total) ? total : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  if (p <= 0) return 0;
  return Math.round((t / p) * 1000) / 1000;
}

export async function upsertMaterial(
  input: Omit<MaterialRecord, 'id'> & { id?: string },
): Promise<MaterialRecord> {
  const all = listMaterials();
  if (input.id) {
    const idx = all.findIndex((m) => m.id === input.id);
    if (idx < 0) throw new Error('Material não encontrado');
    const updated: MaterialRecord = {
      id: input.id,
      name: input.name.trim(),
      unit: input.unit,
      buyPrice: input.buyPrice,
      sellPrice: input.sellPrice,
      active: input.active,
    };
    all[idx] = updated;
    saveJson(KEY, all);
    await enqueueSyncOp({
      entityType: 'Material',
      entityId: updated.id,
      action: 'UPDATE',
      payload: updated as unknown as Record<string, unknown>,
      version: 2,
    });
    return updated;
  }
  const created: MaterialRecord = {
    id: newId(),
    name: input.name.trim(),
    unit: input.unit,
    buyPrice: input.buyPrice,
    sellPrice: input.sellPrice,
    active: input.active,
  };
  all.push(created);
  saveJson(KEY, all);
  await enqueueSyncOp({
    entityType: 'Material',
    entityId: created.id,
    action: 'CREATE',
    payload: created as unknown as Record<string, unknown>,
  });
  return created;
}
