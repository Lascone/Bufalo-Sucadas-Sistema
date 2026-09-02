import { BrowserWindow } from 'electron';
import { runSyncCycle } from './sync-engine';

const SYNC_INTERVAL_MS = 60_000;

let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;
let mainWindow: BrowserWindow | null = null;

export function setOutboxWindow(win: BrowserWindow | null) {
  mainWindow = win;
}

export async function flushOutbox() {
  if (flushing) return runSyncCycle();
  flushing = true;
  try {
    const snap = await runSyncCycle();
    mainWindow?.webContents.send('sync:snapshot', snap);
    const pulled = snap.lastPullOperations?.length ?? 0;
    if (pulled > 0) {
      mainWindow?.webContents.send('remote:changes-applied', { count: pulled });
    }
    return snap;
  } finally {
    flushing = false;
  }
}

export function startOutboxWorker() {
  if (flushTimer) return;
  flushTimer = setInterval(() => void flushOutbox(), SYNC_INTERVAL_MS);
  void flushOutbox();
}

export function stopOutboxWorker() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
