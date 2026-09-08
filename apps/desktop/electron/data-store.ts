import fs from 'node:fs';
import path from 'node:path';
import { getBackupDir, getDataDir } from './local-db';

export const DATA_STORE_FILE = 'app-data.json';
export const PREFIX = 'ferrogestor:';

export const DATA_KEYS = [
  'sales',
  'settings',
  'settings-entity-id',
  'contacts',
  'materials',
  'material-photos',
  'partner-photos',
  'local-operator',
  'patio-movements',
  'finance-days',
  'purchases',
  'cash-registers',
  'session',
  'offline-sync-queue',
] as const;

type DataStore = Record<string, unknown>;

let cache: DataStore | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function storePath(): string {
  return path.join(getDataDir(), DATA_STORE_FILE);
}

function readJsonFile(filePath: string): DataStore | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as DataStore;
    }
  } catch {
    // corrupted file — caller may try backups
  }
  return null;
}

function countRecords(data: DataStore): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of DATA_KEYS) {
    const full = PREFIX + key;
    const val = data[full];
    if (Array.isArray(val)) counts[key] = val.length;
    else if (val && typeof val === 'object') counts[key] = Object.keys(val as object).length;
    else if (val != null) counts[key] = 1;
    else counts[key] = 0;
  }
  return counts;
}

function totalRecords(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function legacyUserDataDirs(): string[] {
  const appData = process.env.APPDATA ?? '';
  const names = [
    'Bufalo Sucata Gestor',
    '@ferrogestor/desktop',
    'bufalo-sucata-gestor',
    'ferrogestor',
    'Búfalo Sucata Gestor',
  ];
  const dirs = new Set<string>();
  for (const name of names) {
    dirs.add(path.join(appData, name));
  }
  if (appData && fs.existsSync(appData)) {
    for (const entry of fs.readdirSync(appData, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (/bufalo|ferro|gestor|sucata/i.test(entry.name)) {
        dirs.add(path.join(appData, entry.name));
      }
    }
  }
  const current = getDataDir().replace(/[/\\]data$/i, '');
  return [...dirs].filter((d) => d !== current && fs.existsSync(d));
}

function copyDirIfExists(from: string, to: string): void {
  if (!fs.existsSync(from)) return;
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirIfExists(src, dest);
    else if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  }
}

/** Se o perfil atual está vazio, importa o app-data (e mídia) do perfil legado mais completo. */
export function migrateFromLegacyProfiles(): {
  imported: boolean;
  fromDir: string | null;
  totalRecords: number;
} {
  const currentPath = storePath();
  const current = readJsonFile(currentPath);
  const currentTotal = current ? totalRecords(countRecords(current)) : 0;
  if (currentTotal > 0) {
    return { imported: false, fromDir: null, totalRecords: currentTotal };
  }

  let best: { dir: string; data: DataStore; total: number } | null = null;
  for (const dir of legacyUserDataDirs()) {
    const candidatePath = path.join(dir, 'data', DATA_STORE_FILE);
    const data = readJsonFile(candidatePath);
    if (!data) continue;
    const total = totalRecords(countRecords(data));
    if (!best || total > best.total) {
      best = { dir, data, total };
    }
  }

  if (!best || best.total === 0) {
    return { imported: false, fromDir: null, totalRecords: 0 };
  }

  cache = best.data;
  writeDataStore(cache, 'legacy-import');
  copyDirIfExists(
    path.join(best.dir, 'media'),
    path.join(path.dirname(getDataDir()), 'media'),
  );
  return { imported: true, fromDir: best.dir, totalRecords: best.total };
}

export function loadDataStore(): DataStore {
  if (cache) return { ...cache };

  const primary = readJsonFile(storePath());
  if (primary && totalRecords(countRecords(primary)) > 0) {
    cache = primary;
    return { ...cache };
  }

  const backup = findLatestDataBackup();
  if (backup) {
    const restored = readJsonFile(backup.path);
    if (restored && totalRecords(countRecords(restored)) > 0) {
      cache = restored;
      writeDataStore(cache, 'auto-recover');
      return { ...cache };
    }
  }

  cache = primary ?? {};
  return { ...cache };
}

function writeDataStore(data: DataStore, _reason: string): void {
  cache = { ...data };
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const target = storePath();
  const tmp = target + '.tmp';

  // Proteção vital contra wipe acidental:
  // Nunca sobrescreve dados existentes com dados vazios a menos que seja um comando explícito de wipe.
  const isExplicitWipe = _reason === 'wipe' || _reason === 'manual-wipe';
  if (!isExplicitWipe && fs.existsSync(target)) {
    try {
      const existing = readJsonFile(target);
      if (existing) {
        const existingRecords = totalRecords(countRecords(existing));
        const newRecords = totalRecords(countRecords(cache));
        if (existingRecords > 0 && newRecords === 0) {
          console.warn(
            `[data-store] Bloqueada tentativa de sobrescrever ${existingRecords} registros por 0 (motivo: ${_reason})!`,
          );
          return;
        }
      }
    } catch {
      // ignore
    }
  }

  const content = JSON.stringify(cache, null, 2);
  fs.writeFileSync(tmp, content, 'utf8');

  // No Windows, renameSync pode falhar temporariamente por antivírus/file lock
  let renamed = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmp, target);
      renamed = true;
      break;
    } catch (err) {
      if (attempt === 4) {
        try {
          fs.copyFileSync(tmp, target);
          fs.unlinkSync(tmp);
          renamed = true;
        } catch (copyErr) {
          console.error('[data-store] Erro crítico ao gravar dados no disco:', copyErr);
        }
      } else {
        // Pausa síncrona curta antes de tentar de novo
        const start = Date.now();
        while (Date.now() - start < 30) {
          /* spin wait 30ms */
        }
      }
    }
  }
}

export function schedulePersist(data: DataStore): void {
  cache = { ...data };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeDataStore(cache ?? {}, 'auto-save');
    saveTimer = null;
  }, 300);
}

export function persistNow(data: DataStore, reason = 'manual'): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writeDataStore(data, reason);
}

export function mergeDataStore(partial: DataStore, reason: string): DataStore {
  const current = loadDataStore();
  const merged = { ...current, ...partial };
  // Usa schedulePersist para evitar múltiplos acessos síncronos simultâneos ao disco em cliques rápidos
  schedulePersist(merged);
  return merged;
}

export function getStoreStats(data?: DataStore): {
  counts: Record<string, number>;
  total: number;
  storePath: string;
  sizeBytes: number;
} {
  const store = data ?? loadDataStore();
  const counts = countRecords(store);
  const p = storePath();
  return {
    counts,
    total: totalRecords(counts),
    storePath: p,
    sizeBytes: fs.existsSync(p) ? fs.statSync(p).size : 0,
  };
}

export const MAX_DATA_BACKUPS = 10;

export function createDataBackup(reason: string): string | null {
  const data = cache ?? loadDataStore();
  if (totalRecords(countRecords(data)) === 0) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(getBackupDir(), `data-backup-${reason}-${stamp}.json`);
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
  trimOldDataBackups(MAX_DATA_BACKUPS);
  return target;
}

function trimOldDataBackups(keep: number): void {
  const dir = getBackupDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('data-backup-') && f.endsWith('.json'))
    .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, file.name));
    } catch {
      // ignore
    }
  }
}

export function listDataBackups(): Array<{
  name: string;
  path: string;
  size: number;
  totalRecords: number;
}> {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('data-backup-') && f.endsWith('.json'))
    .map((name) => {
      const full = path.join(dir, name);
      const data = readJsonFile(full);
      const total = data ? totalRecords(countRecords(data)) : 0;
      return { name, path: full, size: fs.statSync(full).size, totalRecords: total };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function findLatestDataBackup(): { name: string; path: string; totalRecords: number } | null {
  const list = listDataBackups().filter((b) => b.totalRecords > 0);
  return list[0] ?? null;
}

export function restoreFromFile(filePath: string): DataStore {
  const data = readJsonFile(filePath);
  if (!data) throw new Error('Arquivo de backup inválido ou corrompido');
  persistNow(data, 'restore');
  return data;
}
