import { loadJson, saveJson, enqueueSyncOp, newId } from './local-store';
import {
  Anvil,
  Beer,
  Boxes,
  Droplets,
  Flame,
  Hexagon,
  Layers,
  Package,
  Recycle,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';

export type MaterialIconSlug =
  | 'ferro'
  | 'cobre'
  | 'aluminio'
  | 'misto'
  | 'plasticomisto'
  | 'oleo'
  | 'papelao'
  | 'pet'
  | 'metais'
  | 'sucata'
  | 'latinha'
  | 'default';

export const MATERIAL_ICON_OPTIONS: Array<{
  slug: MaterialIconSlug;
  label: string;
  Icon: LucideIcon;
}> = [
  { slug: 'metais', label: 'Metais', Icon: Anvil },
  { slug: 'sucata', label: 'Sucata', Icon: Boxes },
  { slug: 'ferro', label: 'Ferro', Icon: Anvil },
  { slug: 'cobre', label: 'Cobre', Icon: Flame },
  { slug: 'aluminio', label: 'Alumínio', Icon: Hexagon },
  { slug: 'latinha', label: 'Latinhas', Icon: Beer },
  { slug: 'oleo', label: 'Óleo', Icon: Droplets },
  { slug: 'papelao', label: 'Papelão', Icon: ScrollText },
  { slug: 'pet', label: 'PET', Icon: Recycle },
  { slug: 'misto', label: 'Misto', Icon: Layers },
  { slug: 'plasticomisto', label: 'Plástico misto', Icon: Layers },
  { slug: 'default', label: 'Padrão', Icon: Package },
];

export function materialIcon(slug?: string): LucideIcon {
  return MATERIAL_ICON_OPTIONS.find((o) => o.slug === slug)?.Icon ?? Boxes;
}

/** Uma tecla: dígito 0–9 ou letra a–z (caixa indiferente). */
export type MaterialHotkey = string;

export const MATERIAL_HOTKEYS: MaterialHotkey[] = [
  ...'0123456789'.split(''),
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
];

export const INDEFINIDO_MATERIAL_ID = 'mat-indefinido';

export type MaterialRecord = {
  id: string;
  name: string;
  unit: 'KG' | 'TON' | 'UNIT';
  buyPrice: number;
  sellPrice: number;
  active: boolean;
  icon: MaterialIconSlug;
  /** Atalho no Caixa — uma tecla 0–9 ou a–z (único entre ativos). */
  hotkey?: MaterialHotkey;
  /**
   * Foto: arquivo em userData, data URL, ou asset empacotado
   * (ex.: ./material-icons/aluminio.png).
   */
  photoPath?: string;
};

const KEY = 'materials';
const PHOTOS_KEY = 'material-photos';
const SEED_VERSION_KEY = 'materials-seed-version';
/** Bump when default catalog changes (pre-lancamento). */
const SEED_VERSION = 9;

const ICON_DIR = './material-icons';

function parseHotkey(value: unknown): MaterialHotkey | undefined {
  if (typeof value !== 'string') return undefined;
  const k = value.trim().toLowerCase();
  if (k.length !== 1) return undefined;
  if (!/^[0-9a-z]$/.test(k)) return undefined;
  return k;
}

/** Catalogo padrao — Indefinido (0) + materiais com PNG e atalhos. */
const SEED: MaterialRecord[] = [
  {
    id: INDEFINIDO_MATERIAL_ID,
    name: 'Indefinido',
    unit: 'KG',
    buyPrice: 0,
    sellPrice: 0,
    active: true,
    icon: 'default',
    hotkey: '0',
  },
  {
    id: 'mat-aluminio',
    name: 'Alumínio',
    unit: 'KG',
    buyPrice: 0,
    sellPrice: 0,
    active: true,
    icon: 'aluminio',
    photoPath: `${ICON_DIR}/aluminio.png`,
    hotkey: '1',
  },
  {
    id: 'mat-metais',
    name: 'Metais',
    unit: 'KG',
    buyPrice: 0,
    sellPrice: 0,
    active: true,
    icon: 'metais',
    photoPath: `${ICON_DIR}/metais.png`,
    hotkey: '2',
  },
  {
    id: 'mat-oleo',
    name: 'Óleo',
    unit: 'KG',
    buyPrice: 0,
    sellPrice: 0,
    active: true,
    icon: 'oleo',
    photoPath: `${ICON_DIR}/oleo.png`,
    hotkey: '3',
  },
  {
    id: 'mat-papelao',
    name: 'Papelão',
    unit: 'KG',
    buyPrice: 0,
    sellPrice: 0,
    active: true,
    icon: 'papelao',
    photoPath: `${ICON_DIR}/papelao.png`,
    hotkey: '4',
  },
  {
    id: 'mat-pet',
    name: 'PET',
    unit: 'KG',
    buyPrice: 0,
    sellPrice: 0,
    active: true,
    icon: 'pet',
    photoPath: `${ICON_DIR}/pet.png`,
    hotkey: '5',
  },
  {
    id: 'mat-sucata',
    name: 'Sucata',
    unit: 'KG',
    buyPrice: 0,
    sellPrice: 0,
    active: true,
    icon: 'sucata',
    photoPath: `${ICON_DIR}/sucata.png`,
    hotkey: '6',
  },
  {
    id: 'mat-latinha',
    name: 'Latinhas',
    unit: 'KG',
    buyPrice: 0,
    sellPrice: 0,
    active: true,
    icon: 'latinha',
    photoPath: `${ICON_DIR}/latinha.png`,
    hotkey: '7',
  },
  {
    id: 'mat-plasticomisto',
    name: 'Plástico misto',
    unit: 'KG',
    buyPrice: 0,
    sellPrice: 0,
    active: true,
    icon: 'plasticomisto',
    photoPath: `${ICON_DIR}/plasticomisto.png`,
    hotkey: '8',
  },
];

function isBundledPhotoPath(path?: string): boolean {
  if (!path) return false;
  return (
    path.startsWith('./material-icons/') ||
    path.startsWith('material-icons/') ||
    path.startsWith('./icones')
  );
}

function normalizeMaterial(m: MaterialRecord): MaterialRecord {
  const hotkey = parseHotkey(m.hotkey);
  const row: MaterialRecord = {
    ...m,
    icon: (m.icon as MaterialIconSlug) ?? guessIcon(m.name),
    photoPath: m.photoPath,
  };
  if (hotkey) row.hotkey = hotkey;
  else delete row.hotkey;
  return row;
}

function ensureSeed(): MaterialRecord[] {
  const ver = loadJson<number>(SEED_VERSION_KEY, 0);
  const existing = loadJson<MaterialRecord[] | null>(KEY, null);

  if (!existing || existing.length === 0) {
    const custom =
      existing?.filter(
        (m) =>
          m.id &&
          !String(m.id).startsWith('mat-') &&
          !isLegacyDefaultName(m.name),
      ) ?? [];
    const seeded = [...SEED.map((m) => ({ ...m })), ...custom];
    saveJson(KEY, seeded);
    saveJson(SEED_VERSION_KEY, SEED_VERSION);
    return seeded;
  }

  let next = existing.map(normalizeMaterial);
  let dirty = ver < SEED_VERSION;

  // Sempre garante materiais do catálogo (ex.: Latinhas se seed passou e faltou)
  for (const seed of SEED) {
    if (!next.some((m) => m.id === seed.id)) {
      next = [...next, { ...seed }];
      dirty = true;
    }
  }

  if (!dirty) return next;

  // Indefinido sempre com atalho 0
  next = next.map((m) => {
    if (m.id !== INDEFINIDO_MATERIAL_ID) return m;
    return { ...m, hotkey: '0' as MaterialHotkey };
  });
  next = next.map((m) => {
    if (m.id === INDEFINIDO_MATERIAL_ID) return m;
    if (m.hotkey !== '0') return m;
    const { hotkey: _removed, ...rest } = m;
    return rest;
  });

  const used = new Set(
    next.map((m) => m.hotkey).filter(Boolean) as MaterialHotkey[],
  );
  next = next.map((m) => {
    if (m.hotkey) return m;
    const seed = SEED.find((s) => s.id === m.id);
    if (!seed?.hotkey || used.has(seed.hotkey)) return m;
    used.add(seed.hotkey);
    return { ...m, hotkey: seed.hotkey };
  });

  // PNG/ícone do catálogo (força latinha.png se o registro existir sem foto)
  next = next.map((m) => {
    const seed = SEED.find((s) => s.id === m.id);
    if (!seed) return m;
    let updated = m;
    if (seed.photoPath && (!updated.photoPath || updated.id === 'mat-latinha')) {
      updated = { ...updated, photoPath: seed.photoPath };
    }
    if (seed.icon && (!updated.icon || updated.icon === 'default' || updated.id === 'mat-latinha')) {
      updated = { ...updated, icon: seed.icon };
    }
    if (seed.hotkey && !updated.hotkey && !used.has(seed.hotkey)) {
      used.add(seed.hotkey);
      updated = { ...updated, hotkey: seed.hotkey };
    }
    return updated;
  });

  saveJson(KEY, next);
  saveJson(SEED_VERSION_KEY, SEED_VERSION);
  return next;
}

/** Material inicial nas linhas de compra do Caixa. */
export function defaultCashBuyMaterialId(): string {
  const mats = listMaterials(true);
  return (
    mats.find((m) => m.id === INDEFINIDO_MATERIAL_ID)?.id ?? mats[0]?.id ?? ''
  );
}

function isLegacyDefaultName(name: string): boolean {
  const legacy = [
    'ferro pesado',
    'ferro leve',
    'cobre limpo',
    'cobre queimado',
    'alumínio limpo',
    'aluminio limpo',
    'alumínio perfil',
    'aluminio perfil',
    'sucata mista',
    'sucata',
  ];
  return legacy.includes(name.trim().toLowerCase());
}

function guessIcon(name: string): MaterialIconSlug {
  const n = name.toLowerCase();
  if (n.includes('ferro') || n.includes('metal')) return 'metais';
  if (n.includes('cobre')) return 'cobre';
  if (n.includes('alum')) return 'aluminio';
  if (n.includes('óleo') || n.includes('oleo')) return 'oleo';
  if (n.includes('papel')) return 'papelao';
  if (n.includes('pet')) return 'pet';
  if (n.includes('sucata')) return 'sucata';
  if (n.includes('latinh')) return 'latinha';
  if (n.includes('plást') || n.includes('plast')) return 'plasticomisto';
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
  const all = ensureSeed().sort((a, b) => {
    if (a.id === INDEFINIDO_MATERIAL_ID) return -1;
    if (b.id === INDEFINIDO_MATERIAL_ID) return 1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
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

/** From line total and preco/kg → peso (3 decimal places for kg). */
export function weightFromTotal(total: number, unitPrice: number): number {
  const t = Number.isFinite(total) ? total : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  if (p <= 0) return 0;
  return Math.round((t / p) * 1000) / 1000;
}

export type MaterialVisual =
  | { kind: 'img'; src: string; Icon: LucideIcon }
  | { kind: 'icon'; Icon: LucideIcon };

/** Sync preview: bundled PNG, local fallback, or Lucide. */
export function materialVisualSync(
  material?: Pick<MaterialRecord, 'icon' | 'photoPath' | 'id'> | null,
): MaterialVisual {
  const Icon = materialIcon(material?.icon);
  if (!material?.photoPath) return { kind: 'icon', Icon };
  if (isBundledPhotoPath(material.photoPath)) {
    const src = material.photoPath.startsWith('./')
      ? material.photoPath
      : `./${material.photoPath}`;
    return { kind: 'img', src, Icon };
  }
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
  if (isBundledPhotoPath(material.photoPath)) {
    return material.photoPath.startsWith('./')
      ? material.photoPath
      : `./${material.photoPath}`;
  }
  const local = loadLocalPhotos()[material.id];
  if (local) return local;
  if (material.photoPath.startsWith('data:')) return material.photoPath;
  if (window.ferrogestor?.getMaterialPhotoDataUrl) {
    return window.ferrogestor.getMaterialPhotoDataUrl(material.photoPath);
  }
  return null;
}

function fileToBase64(
  file: File,
): Promise<{ base64: string; ext: string; dataUrl: string }> {
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
  if (
    prev &&
    window.ferrogestor?.deleteMaterialPhoto &&
    !prev.startsWith('data:') &&
    !isBundledPhotoPath(prev)
  ) {
    await window.ferrogestor.deleteMaterialPhoto(prev);
  }
  const map = loadLocalPhotos();
  delete map[materialId];
  saveLocalPhotos(map);
  if (idx >= 0) {
    const current = all[idx]!;
    const seed = SEED.find((s) => s.id === materialId);
    if (seed?.photoPath) {
      all[idx] = { ...current, photoPath: seed.photoPath };
    } else {
      const { photoPath: _removed, ...rest } = current;
      all[idx] = { ...rest };
    }
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

function clearHotkeyConflicts(
  all: MaterialRecord[],
  keepId: string | undefined,
  hotkey: MaterialHotkey | undefined,
) {
  if (!hotkey) return;
  for (let i = 0; i < all.length; i++) {
    const row = all[i]!;
    if (row.id === keepId) continue;
    if (row.hotkey !== hotkey) continue;
    const { hotkey: _removed, ...rest } = row;
    all[i] = rest;
  }
}

export async function upsertMaterial(
  input: Omit<MaterialRecord, 'id'> & { id?: string },
): Promise<MaterialRecord> {
  const all = listMaterials();
  const hotkey = parseHotkey(input.hotkey);
  if (input.id) {
    const idx = all.findIndex((m) => m.id === input.id);
    if (idx < 0) throw new Error('Material não encontrado');
    clearHotkeyConflicts(all, input.id, hotkey);
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
    if (hotkey) updated.hotkey = hotkey;
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
  clearHotkeyConflicts(all, undefined, hotkey);
  const created: MaterialRecord = {
    id: newId(),
    name: input.name.trim(),
    unit: input.unit,
    buyPrice: input.buyPrice,
    sellPrice: input.sellPrice,
    active: input.active,
    icon: input.icon ?? guessIcon(input.name),
  };
  if (hotkey) created.hotkey = hotkey;
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
