import fs from 'node:fs';
import path from 'node:path';
import { getBackupDir, getLocalDbPath } from './local-db';

export async function createBackup(reason: string): Promise<{
  path: string;
  reason: string;
  createdAt: string;
}> {
  const dbPath = getLocalDbPath();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(getBackupDir(), `backup-${reason}-${stamp}.db`);

  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, target);
  } else {
    fs.writeFileSync(target, '');
  }

  return {
    path: target,
    reason,
    createdAt: new Date().toISOString(),
  };
}

export function listBackups(): Array<{ name: string; path: string; size: number }> {
  const dir = getBackupDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((name) => {
      const full = path.join(dir, name);
      return { name, path: full, size: fs.statSync(full).size };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function restoreBackup(backupPath: string): void {
  const dbPath = getLocalDbPath();
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup não encontrado');
  }
  fs.copyFileSync(backupPath, dbPath);
}
