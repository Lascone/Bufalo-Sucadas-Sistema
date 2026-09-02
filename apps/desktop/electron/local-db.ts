import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureLocalDataDir(): string {
  return getDataDir();
}

export function getLocalDbPath(): string {
  return path.join(getDataDir(), 'ferrogestor-local.db');
}

export function getBackupDir(): string {
  const dir = path.join(app.getPath('userData'), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function removePath(target: string): void {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

export type WipeUserDataResult = {
  ok: true;
  cleared: string[];
};

/** Clears folders under Electron userData (media, exports, sync queue, etc.). */
export function wipeUserDataFolders(opts?: {
  clearMedia?: boolean;
  clearExports?: boolean;
  clearBackups?: boolean;
  clearSyncQueue?: boolean;
  clearSqlite?: boolean;
}): WipeUserDataResult {
  const clearMedia = opts?.clearMedia !== false;
  const clearExports = opts?.clearExports !== false;
  const clearBackups = opts?.clearBackups !== false;
  const clearSyncQueue = opts?.clearSyncQueue !== false;
  const clearSqlite = opts?.clearSqlite !== false;

  const userData = app.getPath('userData');
  const cleared: string[] = [];

  if (clearMedia) {
    removePath(path.join(userData, 'media'));
    cleared.push('media');
  }
  if (clearExports) {
    removePath(path.join(userData, 'exports'));
    cleared.push('exports');
  }
  if (clearBackups) {
    removePath(path.join(userData, 'backups'));
    cleared.push('backups');
  }

  ensureLocalDataDir();

  if (clearSyncQueue) {
    const syncFile = path.join(getDataDir(), 'sync-queue.json');
    fs.writeFileSync(
      syncFile,
      JSON.stringify(
        {
          pending: [],
          lastSyncAt: null,
          lastError: null,
          online: null,
          history: [],
        },
        null,
        2,
      ),
      'utf8',
    );
    cleared.push('sync-queue');
  }

  if (clearSqlite) {
    const db = getLocalDbPath();
    if (fs.existsSync(db)) {
      fs.unlinkSync(db);
      cleared.push('sqlite');
    }
  }

  return { ok: true, cleared };
}
