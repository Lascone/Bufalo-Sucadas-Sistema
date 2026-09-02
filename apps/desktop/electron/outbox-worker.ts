import { BrowserWindow } from 'electron';
import { enqueueSyncOp, runSyncCycle, type LocalSyncOp } from './sync-engine';
import {
  loginAndRegister,
  loadSession,
  clearSession,
  type AuthSession,
} from './session-store';

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
    mainWindow?.webContents.send('outbox:snapshot', snap);
    if (snap.remoteApplied && snap.remoteApplied > 0) {
      mainWindow?.webContents.send('remote:changes-applied', {
        count: snap.remoteApplied,
      });
    }
    return snap;
  } finally {
    flushing = false;
  }
}

export function scheduleFlush() {
  void flushOutbox();
}

export function startOutboxWorker() {
  if (flushTimer) return;
  flushTimer = setInterval(() => void flushOutbox(), 4000);
  void flushOutbox();
}

export function stopOutboxWorker() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function enqueueAndFlush(op: LocalSyncOp) {
  enqueueSyncOp(op);
  scheduleFlush();
}

export { loginAndRegister, loadSession, clearSession, type AuthSession };
