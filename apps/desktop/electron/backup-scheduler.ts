import fs from 'node:fs';
import path from 'node:path';
import { createDataBackup } from './data-store';
import { getBackupDir } from './local-db';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const MARKER = '.last-auto-backup';

function markerPath(): string {
  return path.join(getBackupDir(), MARKER);
}

function lastAutoBackupAt(): number {
  try {
    const raw = fs.readFileSync(markerPath(), 'utf8').trim();
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function markAutoBackup(): void {
  fs.writeFileSync(markerPath(), new Date().toISOString(), 'utf8');
}

export function runScheduledBackupIfDue(reason = 'auto-12h'): string | null {
  const last = lastAutoBackupAt();
  if (Date.now() - last < TWELVE_HOURS_MS) return null;
  const target = createDataBackup(reason);
  if (target) markAutoBackup();
  return target;
}

export function startAutoBackupScheduler(): void {
  void runScheduledBackupIfDue('startup');
  setInterval(() => {
    void runScheduledBackupIfDue('auto-12h');
  }, TWELVE_HOURS_MS);
}
