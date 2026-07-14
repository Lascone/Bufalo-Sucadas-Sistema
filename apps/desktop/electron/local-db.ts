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
