import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import {
  Anvil,
  Boxes,
  Flame,
  Hexagon,
  Layers,
  Package,
  type LucideIcon,
} from 'lucide-react';

export type MaterialIconSlug =
  | 'ferro'
  | 'cobre'
  | 'aluminio'
  | 'misto'
  | 'default';

export const MATERIAL_ICON_OPTIONS: Array<{
  slug: MaterialIconSlug;
  label: string;
  Icon: LucideIcon;
}> = [
  { slug: 'ferro', label: 'Ferro', Icon: Anvil },
  { slug: 'cobre', label: 'Cobre', Icon: Flame },
  { slug: 'aluminio', label: 'Alumínio', Icon: Hexagon },
  { slug: 'misto', label: 'Misto', Icon: Layers },
  { slug: 'default', label: 'Padrão', Icon: Package },
];

export function materialIcon(slug?: string): LucideIcon {
  return MATERIAL_ICON_OPTIONS.find((o) => o.slug === slug)?.Icon ?? Boxes;
}

export type MaterialRecord = {
  id: string;
  name: string;
  unit: 'KG' | 'TON' | 'UNIT';
  buyPrice: number;
  sellPrice: number;
  active: boolean;
  icon: MaterialIconSlug;
  /** Relative filename under userData/media/materials, or local fallback key */
  photoPath?: string;
};

const KEY = 'materials';
const PHOTOS_KEY = 'material-photos';

const SEED: Omit<MaterialRecord, 'id'>[] = [
  { name: 'Ferro pesado', unit: 'KG', buyPrice: 0.5, sellPrice: 0.65, active: true, icon: 'ferro' },
  { name: 'Ferro leve', unit: 'KG', buyPrice: 0.35, sellPrice: 0.5, active: true, icon: 'ferro' },
  { name: 'Cobre limpo', unit: 'KG', buyPrice: 32, sellPrice: 38, active: true, icon: 'cobre' },
  { name: 'Cobre queimado', unit: 'KG', buyPrice: 26, sellPrice: 31, active: true, icon: 'cobre' },
  { name: 'Alumínio limpo', unit: 'KG', buyPrice: 8.5, sellPrice: 10.5, active: true, icon: 'aluminio' },
  { name: 'Alumínio perfil', unit: 'KG', buyPrice: 7.8, sellPrice: 9.8, active: true, icon: 'aluminio' },
  { name: 'Sucata mista', unit: 'KG', buyPrice: 0.7, sellPrice: 0.95, active: true, icon: 'misto' },
];

function ensureSeed(): MaterialRecord[] {
  const existing = loadJson<MaterialRecord[] | null>(KEY, null);
  if (existing && existing.length > 0) {
    return existing.map((m) => ({
      ...m,
      icon: m.icon ?? guessIcon(m.name),
      photoPath: m.photoPath,
    }));
  }
  const seeded = SEED.map((m) => ({ ...m, id: newId() }));
  saveJson(KEY, seeded);
  return seeded;
}

function guessIcon(name: string): MaterialIconSlug {
  const n = name.toLowerCase();
  if (n.includes('ferro')) return 'ferro';
  if (n.includes('cobre')) return 'cobre';
  if (n.includes('alum')) return 'aluminio';
  if (n.includes('mist')) return 'misto';
  return 'default';
}

function loadLocalPhotos(): Record<string, string> {
  return loadJson<Record<string, string>>(PHOTOS_KEY, {});
}

function saveLocalPhotos(map: Record<string, string>) {
  saveJson(PHOTOS_KEY, map);
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

export type MaterialVisual =
  | { kind: 'img'; src: string; Icon: LucideIcon }
  | { kind: 'icon'; Icon: LucideIcon };

/** Sync preview: uses local fallback map; Electron URL may need async resolve. */
export function materialVisualSync(
  material?: Pick<MaterialRecord, 'icon' | 'photoPath' | 'id'> | null,
): MaterialVisual {
  const Icon = materialIcon(material?.icon);
  if (!material?.photoPath) return { kind: 'icon', Icon };
  const local = loadLocalPhotos()[material.id];
  if (local) return { kind: 'img', src: local, Icon };
  if (material.photoPath.startsWith('data:')) {
    return { kind: 'img', src: material.photoPath, Icon };
  }
  return { kind: 'icon', Icon };
}

/** Prefer Electron file, then localStorage fallback. */
export async function resolveMaterialPhotoSrc(
  material: Pick<MaterialRecord, 'id' | 'photoPath'>,
): Promise<string | null> {
  if (!material.photoPath) return null;
  const local = loadLocalPhotos()[material.id];
  if (local) return local;
  if (material.photoPath.startsWith('data:')) return material.photoPath;
  if (window.ferrogestor?.getMaterialPhotoDataUrl) {
    return window.ferrogestor.getMaterialPhotoDataUrl(material.photoPath);
  }
  return null;
}

function fileToBase64(file: File): Promise<{ base64: string; ext: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
      const ext =
        (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() ||
        'jpg';
      resolve({ base64, ext, dataUrl });
    };
    reader.onerror = () => reject(new Error('Falha ao ler imagem'));
    reader.readAsDataURL(file);
  });
}

export async function saveMaterialPhoto(
  materialId: string,
  file: File,
): Promise<string> {
  const { base64, ext, dataUrl } = await fileToBase64(file);
  let photoPath = `${materialId}.${ext}`;
  if (window.ferrogestor?.saveMaterialPhoto) {
    const res = await window.ferrogestor.saveMaterialPhoto({
      materialId,
      base64,
      ext,
    });
    photoPath = res.photoPath;
  }
  const map = loadLocalPhotos();
  map[materialId] = dataUrl;
  saveLocalPhotos(map);

  const all = listMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  if (idx >= 0) {
    all[idx] = { ...all[idx]!, photoPath };
    saveJson(KEY, all);
    await enqueueSyncOp({
      entityType: 'Material',
      entityId: materialId,
      action: 'UPDATE',
      payload: all[idx] as unknown as Record<string, unknown>,
      version: 2,
    });
  }
  return photoPath;
}

export async function clearMaterialPhoto(materialId: string): Promise<void> {
  const all = listMaterials();
  const idx = all.findIndex((m) => m.id === materialId);
  const prev = idx >= 0 ? all[idx]!.photoPath : undefined;
  if (prev && window.ferrogestor?.deleteMaterialPhoto && !prev.startsWith('data:')) {
    await window.ferrogestor.deleteMaterialPhoto(prev);
  }
  const map = loadLocalPhotos();
  delete map[materialId];
  saveLocalPhotos(map);
  if (idx >= 0) {
    const { photoPath: _removed, ...rest } = all[idx]!;
    all[idx] = { ...rest };
    saveJson(KEY, all);
    await enqueueSyncOp({
      entityType: 'Material',
      entityId: materialId,
      action: 'UPDATE',
      payload: all[idx] as unknown as Record<string, unknown>,
      version: 2,
    });
  }
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
      icon: input.icon ?? 'default',
      photoPath: input.photoPath ?? all[idx]!.photoPath,
    };
    if (!updated.photoPath) delete updated.photoPath;
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
    icon: input.icon ?? guessIcon(input.name),
  };
  if (input.photoPath) created.photoPath = input.photoPath;
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

export async function deleteMaterial(id: string) {
  await clearMaterialPhoto(id).catch(() => undefined);
  const all = listMaterials().filter((m) => m.id !== id);
  saveJson(KEY, all);
  await enqueueSyncOp({
    entityType: 'Material',
    entityId: id,
    action: 'DELETE',
    payload: { id },
  });
}
