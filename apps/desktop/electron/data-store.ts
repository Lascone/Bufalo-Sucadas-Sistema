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

function writeDataStore(data: DataStore, reason: string): void {
  cache = { ...data };
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = storePath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(tmp, storePath());
  createDataBackup(reason);
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
  persistNow(merged, reason);
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

export function createDataBackup(reason: string): string | null {
  const data = cache ?? loadDataStore();
  if (totalRecords(countRecords(data)) === 0) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(getBackupDir(), `data-backup-${reason}-${stamp}.json`);
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
  trimOldDataBackups(30);
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
