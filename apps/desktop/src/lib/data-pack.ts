import { PREFIX } from './local-store';

/** Keys never put into a transfer pack / always cleared on import. */
export const DATA_PACK_EXCLUDED_KEYS = new Set([
  'active-operator-id',
  'offline-sync-queue',
]);

export function collectStoreForExport(): Record<string, unknown> {
  const store: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const full = localStorage.key(i);
    if (!full?.startsWith(PREFIX)) continue;
    const logical = full.slice(PREFIX.length);
    if (DATA_PACK_EXCLUDED_KEYS.has(logical)) continue;
    const raw = localStorage.getItem(full);
    if (raw == null) continue;
    try {
      store[logical] = JSON.parse(raw);
    } catch {
      store[logical] = raw;
    }
  }
  return store;
}

/**
 * Wipe all ferrogestor:* keys and rewrite from imported store.
 * Excluded keys are never restored.
 */
export function applyImportedStore(store: Record<string, unknown>): {
  written: string[];
} {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const full = localStorage.key(i);
    if (!full?.startsWith(PREFIX)) continue;
    localStorage.removeItem(full);
  }

  const written: string[] = [];
  for (const [logical, value] of Object.entries(store || {})) {
    if (DATA_PACK_EXCLUDED_KEYS.has(logical)) continue;
    if (!logical || logical.includes('..')) continue;
    localStorage.setItem(PREFIX + logical, JSON.stringify(value));
    written.push(logical);
  }
  return { written };
}

export type ExportDataPackResult =
  | { ok: true; path: string; keyCount: number; mediaCount: number }
  | { ok: false; cancelled: true }
  | { ok: false; error: string };

export async function exportDataPack(): Promise<ExportDataPackResult> {
  const api = window.ferrogestor;
  if (!api?.exportDataPack) {
    return {
      ok: false,
      error: 'Exportação só funciona no app instalado (Electron).',
    };
  }
  const store = collectStoreForExport();
  return api.exportDataPack({ store });
}

export type ImportDataPackResult =
  | {
      ok: true;
      path: string;
      keyCount: number;
      mediaCount: number;
      writtenKeys: string[];
    }
  | { ok: false; cancelled: true }
  | { ok: false; error: string };

/**
 * Opens file dialog, applies media on disk, replaces localStorage.
 * Caller should clearOperator + reload after success.
 */
export async function importDataPack(): Promise<ImportDataPackResult> {
  const api = window.ferrogestor;
  if (!api?.importDataPack) {
    return {
      ok: false,
      error: 'Importação só funciona no app instalado (Electron).',
    };
  }
  const res = await api.importDataPack();
  if (!res.ok) return res;
  const { written } = applyImportedStore(res.store);
  return {
    ok: true,
    path: res.path,
    keyCount: res.keyCount,
    mediaCount: res.mediaCount,
    writtenKeys: written,
  };
}
