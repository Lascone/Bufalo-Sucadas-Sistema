import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_STORE_FILE,
  getStoreStats,
  listDataBackups,
  loadDataStore,
} from './data-store';
import { getBackupDir, getDataDir, getLocalDbPath } from './local-db';

export type RecoveryCandidate = {
  id: string;
  label: string;
  userDataDir: string;
  kind: 'app-data' | 'data-backup' | 'sqlite' | 'leveldb' | 'sync-queue';
  path: string;
  exists: boolean;
  sizeBytes: number;
  totalRecords: number;
  modifiedAt: string | null;
  hint: string;
};

export type DataDiagnostic = {
  userDataDir: string;
  dataDir: string;
  backupDir: string;
  storePath: string;
  dbPath: string;
  mediaDir: string;
  exportsDir: string;
  levelDbDir: string;
  currentStats: ReturnType<typeof getStoreStats>;
  dataBackups: ReturnType<typeof listDataBackups>;
  dbBackups: Array<{ name: string; path: string; size: number }>;
  candidates: RecoveryCandidate[];
  warnings: string[];
  tips: string[];
};

function safeStat(filePath: string): { size: number; mtime: Date } | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const st = fs.statSync(filePath);
    return { size: st.size, mtime: st.mtime };
  } catch {
    return null;
  }
}

function countRecordsInFile(filePath: string): number {
  try {
    if (!filePath.endsWith('.json')) return 0;
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    let total = 0;
    for (const val of Object.values(data)) {
      if (Array.isArray(val)) total += val.length;
      else if (val && typeof val === 'object') total += Object.keys(val).length;
      else if (val != null) total += 1;
    }
    return total;
  } catch {
    return 0;
  }
}

export function getCandidateUserDataDirs(): string[] {
  const appData = process.env.APPDATA ?? '';
  const candidates = new Set<string>();

  candidates.add(app.getPath('userData'));

  const knownNames = [
    'Bufalo Sucata Gestor',
    '@ferrogestor/desktop',
    'ferrogestor',
    'Búfalo Sucata Gestor',
    'bufalo-sucata-gestor',
  ];
  for (const name of knownNames) {
    candidates.add(path.join(appData, name));
  }

  if (appData && fs.existsSync(appData)) {
    for (const entry of fs.readdirSync(appData, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (/bufalo|ferro|gestor|sucata/i.test(entry.name)) {
        candidates.add(path.join(appData, entry.name));
      }
    }
  }

  return [...candidates].filter((d) => fs.existsSync(d));
}

function scanUserDataDir(userDataDir: string): RecoveryCandidate[] {
  const results: RecoveryCandidate[] = [];
  const label = path.basename(userDataDir);

  const appDataPath = path.join(userDataDir, 'data', DATA_STORE_FILE);
  const appDataStat = safeStat(appDataPath);
  results.push({
    id: `${userDataDir}::app-data`,
    label,
    userDataDir,
    kind: 'app-data',
    path: appDataPath,
    exists: !!appDataStat,
    sizeBytes: appDataStat?.size ?? 0,
    totalRecords: appDataStat ? countRecordsInFile(appDataPath) : 0,
    modifiedAt: appDataStat?.mtime.toISOString() ?? null,
    hint: 'Arquivo principal de dados (novo formato, mais seguro)',
  });

  const backupDir = path.join(userDataDir, 'backups');
  if (fs.existsSync(backupDir)) {
    for (const name of fs.readdirSync(backupDir)) {
      if (!name.endsWith('.json') && !name.endsWith('.db')) continue;
      const full = path.join(backupDir, name);
      const st = safeStat(full);
      if (!st) continue;
      results.push({
        id: `${full}::backup`,
        label,
        userDataDir,
        kind: name.endsWith('.db') ? 'sqlite' : 'data-backup',
        path: full,
        exists: true,
        sizeBytes: st.size,
        totalRecords: name.endsWith('.json') ? countRecordsInFile(full) : 0,
        modifiedAt: st.mtime.toISOString(),
        hint: name.endsWith('.db')
          ? 'Backup SQLite (legado — dados reais costumam estar no localStorage/JSON)'
          : 'Backup automático JSON dos cadastros',
      });
    }
  }

  const dbPath = path.join(userDataDir, 'data', 'ferrogestor-local.db');
  const dbStat = safeStat(dbPath);
  results.push({
    id: `${userDataDir}::sqlite`,
    label,
    userDataDir,
    kind: 'sqlite',
    path: dbPath,
    exists: !!dbStat,
    sizeBytes: dbStat?.size ?? 0,
    totalRecords: 0,
    modifiedAt: dbStat?.mtime.toISOString() ?? null,
    hint: 'SQLite local (sync/fila — cadastros antigos ficavam no navegador interno)',
  });

  const levelDb = path.join(userDataDir, 'Local Storage', 'leveldb');
  const levelStat = fs.existsSync(levelDb);
  results.push({
    id: `${userDataDir}::leveldb`,
    label,
    userDataDir,
    kind: 'leveldb',
    path: levelDb,
    exists: levelStat,
    sizeBytes: levelStat
      ? fs.readdirSync(levelDb).reduce((sum, f) => {
          try {
            return sum + fs.statSync(path.join(levelDb, f)).size;
          } catch {
            return sum;
          }
        }, 0)
      : 0,
    totalRecords: 0,
    modifiedAt: levelStat ? safeStat(levelDb)?.mtime.toISOString() ?? null : null,
    hint: 'Dados antigos no localStorage do Electron — pode ter vendas/compras escondidas aqui',
  });

  const syncQueue = path.join(userDataDir, 'data', 'sync-queue.json');
  const syncStat = safeStat(syncQueue);
  results.push({
    id: `${userDataDir}::sync`,
    label,
    userDataDir,
    kind: 'sync-queue',
    path: syncQueue,
    exists: !!syncStat,
    sizeBytes: syncStat?.size ?? 0,
    totalRecords: 0,
    modifiedAt: syncStat?.mtime.toISOString() ?? null,
    hint: 'Fila de sincronização com o servidor',
  });

  return results;
}

export function runDataDiagnostic(): DataDiagnostic {
  const userDataDir = app.getPath('userData');
  const dataDir = getDataDir();
  const backupDir = getBackupDir();
  const storePath = path.join(dataDir, DATA_STORE_FILE);
  const dbPath = getLocalDbPath();
  const mediaDir = path.join(userDataDir, 'media', 'materials');
  const exportsDir = path.join(userDataDir, 'exports');
  const levelDbDir = path.join(userDataDir, 'Local Storage', 'leveldb');

  const current = loadDataStore();
  const currentStats = getStoreStats(current);
  const dataBackups = listDataBackups();

  const dbBackups = fs.existsSync(backupDir)
    ? fs
        .readdirSync(backupDir)
        .filter((f) => f.endsWith('.db'))
        .map((name) => {
          const full = path.join(backupDir, name);
          return { name, path: full, size: fs.statSync(full).size };
        })
        .sort((a, b) => b.name.localeCompare(a.name))
    : [];

  const candidates = getCandidateUserDataDirs()
    .flatMap((dir) => scanUserDataDir(dir))
    .filter((c) => c.exists && (c.totalRecords > 0 || c.kind === 'leveldb' || c.sizeBytes > 0))
    .sort((a, b) => b.totalRecords - a.totalRecords || b.sizeBytes - a.sizeBytes);

  const warnings: string[] = [];
  const tips: string[] = [];

  if (currentStats.total === 0) {
    warnings.push(
      'Nenhum cadastro encontrado no arquivo principal. Os dados podem estar em outra pasta (dev vs instalado) ou em backup.',
    );
  }

  const levelDbHere = safeStat(levelDbDir);
  if (levelDbHere && currentStats.total === 0) {
    warnings.push(
      'Existe pasta Local Storage/leveldb neste perfil — versões antigas guardavam tudo ali. Use “Importar do navegador interno” abaixo.',
    );
  }

  const otherWithData = candidates.filter(
    (c) =>
      c.totalRecords > 0 &&
      !c.path.startsWith(dataDir) &&
      c.kind !== 'leveldb',
  );
  if (otherWithData.length > 0) {
    warnings.push(
      `Encontrados ${otherWithData.length} arquivo(s) com dados em outras pastas do AppData.`,
    );
  }

  tips.push(
    `Pasta principal (instalado): %APPDATA%\\Bufalo Sucata Gestor\\`,
  );
  tips.push(`Dados atuais: ${storePath}`);
  tips.push(`Backups JSON: ${backupDir}`);
  tips.push(`Fotos de materiais: ${mediaDir}`);
  tips.push(
    'Modo desenvolvimento (pnpm dev) usa pasta diferente: %APPDATA%\\@ferrogestor\\desktop\\',
  );
  tips.push(
    'Se o PC desligou de repente, confira também a Lixeira e “Versões anteriores” (botão direito na pasta).',
  );

  return {
    userDataDir,
    dataDir,
    backupDir,
    storePath,
    dbPath,
    mediaDir,
    exportsDir,
    levelDbDir,
    currentStats,
    dataBackups,
    dbBackups,
    candidates,
    warnings,
    tips,
  };
}
