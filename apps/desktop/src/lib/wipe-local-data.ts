import { PREFIX } from './local-store';

const SETTINGS_KEYS = new Set(['settings', 'settings-entity-id']);

export type WipeLocalDataOptions = {
  /** Keep company / print / UI / sync URL settings (default true). */
  preserveSettings?: boolean;
  /** Note saved on WipeArchive when PostgreSQL is online. */
  note?: string;
  /** Skip archive/rotate on PG (wipe local only). */
  skipArchive?: boolean;
};

export type WipeLocalDataResult = {
  ok: true;
  removedKeys: string[];
  diskCleared: string[];
  archive?: {
    archivedName: string;
    fromAt: string;
    toAt: string;
  };
  archiveOfflineMessage?: string;
};

/**
 * Factory / pre-launch reset: archives device on PG when possible,
 * then clears ops data, sync queue and userData folders.
 */
export async function wipeLocalData(
  opts?: WipeLocalDataOptions,
): Promise<WipeLocalDataResult> {
  const preserveSettings = opts?.preserveSettings !== false;
  let archiveInfo: WipeLocalDataResult['archive'];
  let archiveOfflineMessage: string | undefined;

  if (!opts?.skipArchive && window.ferrogestor?.archiveRotateOnWipe) {
    // Best-effort: push pending before rotating device
    try {
      await window.ferrogestor.runSyncNow?.();
    } catch {
      /* ignore */
    }
    const rotated = await window.ferrogestor.archiveRotateOnWipe({
      note: opts?.note,
    });
    if (!rotated.ok) {
      throw new Error(rotated.error);
    }
    if (rotated.offline) {
      archiveOfflineMessage = rotated.message;
    } else if (rotated.archive) {
      archiveInfo = {
        archivedName: rotated.archive.archivedName,
        fromAt: rotated.archive.fromAt,
        toAt: rotated.archive.toAt,
      };
    } else if (rotated.archivedName) {
      archiveInfo = {
        archivedName: rotated.archivedName,
        fromAt: new Date().toISOString(),
        toAt: new Date().toISOString(),
      };
    }
  }

  const removedKeys: string[] = [];

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const full = localStorage.key(i);
    if (!full?.startsWith(PREFIX)) continue;
    const logical = full.slice(PREFIX.length);
    if (preserveSettings && SETTINGS_KEYS.has(logical)) continue;
    localStorage.removeItem(full);
    removedKeys.push(logical);
  }

  let diskCleared: string[] = [];
  if (window.ferrogestor?.wipeUserData) {
    const disk = await window.ferrogestor.wipeUserData({
      clearMedia: true,
      clearExports: true,
      clearBackups: true,
      clearSyncQueue: true,
      clearSqlite: true,
    });
    diskCleared = disk.cleared;
  } else {
    diskCleared = [];
  }

  return {
    ok: true,
    removedKeys,
    diskCleared,
    archive: archiveInfo,
    archiveOfflineMessage,
  };
}
