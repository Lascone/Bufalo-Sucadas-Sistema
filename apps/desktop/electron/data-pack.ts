import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { wipeUserDataFolders } from './local-db';

export const BFGPACK_MAGIC = 'BUFALO_BFGPACK_V1';
export const BFGPACK_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

export type BfgMediaEntry = {
  path: string;
  base64: string;
};

export type BfgPack = {
  magic: string;
  appVersion: string;
  exportedAt: string;
  store: Record<string, unknown>;
  media: BfgMediaEntry[];
};

function getMediaRoot(): string {
  return path.join(app.getPath('userData'), 'media');
}

function isSafeMediaRelPath(rel: string): boolean {
  if (!rel || typeof rel !== 'string') return false;
  if (path.isAbsolute(rel)) return false;
  if (rel.includes('..') || rel.includes('\\')) return false;
  if (!rel.startsWith('materials/')) return false;
  const normalized = path.posix.normalize(rel);
  if (normalized !== rel || normalized.startsWith('..')) return false;
  return true;
}

function walkFiles(dir: string, base: string, out: string[]) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.posix.join(base, name.replace(/\\/g, '/'));
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, rel, out);
    else if (st.isFile()) out.push(rel);
  }
}

export function collectMediaEntries(): BfgMediaEntry[] {
  const root = getMediaRoot();
  const rels: string[] = [];
  walkFiles(root, '', rels);
  const media: BfgMediaEntry[] = [];
  for (const rel of rels) {
    const clean = rel.replace(/^\/+/, '');
    if (!isSafeMediaRelPath(clean)) continue;
    const full = path.join(root, ...clean.split('/'));
    if (!fs.existsSync(full)) continue;
    const buf = fs.readFileSync(full);
    media.push({ path: clean, base64: buf.toString('base64') });
  }
  return media;
}

export function buildPack(
  store: Record<string, unknown>,
  appVersion: string,
): BfgPack {
  return {
    magic: BFGPACK_MAGIC,
    appVersion: appVersion || '0.0.0',
    exportedAt: new Date().toISOString(),
    store: store && typeof store === 'object' ? store : {},
    media: collectMediaEntries(),
  };
}

function defaultExportName(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 16)
    .replace('T', '-');
  return `bufalo-dados-${stamp}.bfgpack`;
}

export async function exportPackToDialog(
  win: BrowserWindow | null,
  store: Record<string, unknown>,
): Promise<
  | { ok: true; path: string; keyCount: number; mediaCount: number }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }
> {
  try {
    const pack = buildPack(store, app.getVersion());
    const saveOpts: Electron.SaveDialogOptions = {
      title: 'Exportar dados — Búfalo Sucata',
      defaultPath: defaultExportName(),
      filters: [{ name: 'Pacote Búfalo', extensions: ['bfgpack'] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, saveOpts)
      : await dialog.showSaveDialog(saveOpts);
    if (result.canceled || !result.filePath) {
      return { ok: false, cancelled: true };
    }
    let target = result.filePath;
    if (!target.toLowerCase().endsWith('.bfgpack')) {
      target = `${target}.bfgpack`;
    }
    const json = JSON.stringify(pack);
    if (Buffer.byteLength(json, 'utf8') > BFGPACK_MAX_BYTES) {
      return {
        ok: false,
        error: 'Pacote maior que 100 MB. Remova fotos grandes e tente de novo.',
      };
    }
    fs.writeFileSync(target, json, 'utf8');
    return {
      ok: true,
      path: target,
      keyCount: Object.keys(pack.store).length,
      mediaCount: pack.media.length,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseAndValidatePack(raw: string): BfgPack {
  if (Buffer.byteLength(raw, 'utf8') > BFGPACK_MAX_BYTES) {
    throw new Error('Arquivo maior que 100 MB.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Arquivo inválido (JSON quebrado).');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Arquivo inválido.');
  }
  const pack = parsed as BfgPack;
  if (pack.magic !== BFGPACK_MAGIC) {
    throw new Error('Arquivo não é um pacote Búfalo válido (.bfgpack).');
  }
  if (!pack.store || typeof pack.store !== 'object' || Array.isArray(pack.store)) {
    throw new Error('Pacote sem dados (store).');
  }
  if (!Array.isArray(pack.media)) {
    throw new Error('Pacote com mídia inválida.');
  }
  for (const entry of pack.media) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.base64 !== 'string') {
      throw new Error('Entrada de mídia inválida no pacote.');
    }
    if (!isSafeMediaRelPath(entry.path)) {
      throw new Error(`Caminho de mídia inseguro: ${entry.path}`);
    }
  }
  return pack;
}

export function applyMediaFromPack(media: BfgMediaEntry[]): number {
  const root = getMediaRoot();
  // Wipe existing media then restore from pack
  wipeUserDataFolders({
    clearMedia: true,
    clearExports: false,
    clearBackups: false,
    clearSyncQueue: true,
    clearSqlite: false,
  });
  let written = 0;
  for (const entry of media) {
    if (!isSafeMediaRelPath(entry.path)) continue;
    const full = path.join(root, ...entry.path.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.from(entry.base64, 'base64'));
    written += 1;
  }
  return written;
}

export async function importPackFromDialog(
  win: BrowserWindow | null,
): Promise<
  | {
      ok: true;
      path: string;
      store: Record<string, unknown>;
      keyCount: number;
      mediaCount: number;
      exportedAt?: string;
      appVersion?: string;
    }
  | { ok: false; cancelled: true }
  | { ok: false; error: string }
> {
  try {
    const openOpts: Electron.OpenDialogOptions = {
      title: 'Importar dados — Búfalo Sucata',
      properties: ['openFile'],
      filters: [{ name: 'Pacote Búfalo', extensions: ['bfgpack'] }],
    };
    const result = win
      ? await dialog.showOpenDialog(win, openOpts)
      : await dialog.showOpenDialog(openOpts);
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, cancelled: true };
    }
    const filePath = result.filePaths[0];
    const st = fs.statSync(filePath);
    if (st.size > BFGPACK_MAX_BYTES) {
      return { ok: false, error: 'Arquivo maior que 100 MB.' };
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const pack = parseAndValidatePack(raw);
    const mediaCount = applyMediaFromPack(pack.media);
    return {
      ok: true,
      path: filePath,
      store: pack.store,
      keyCount: Object.keys(pack.store).length,
      mediaCount,
      exportedAt: pack.exportedAt,
      appVersion: pack.appVersion,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
