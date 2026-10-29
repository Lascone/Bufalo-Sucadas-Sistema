import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJson, saveJson, enqueueSyncOp, PREFIX } from './local-store';

const memory = new Map<string, string>();

function installLocalStorageMock() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memory.set(k, String(v));
      },
      removeItem: (k: string) => {
        memory.delete(k);
      },
      clear: () => memory.clear(),
      key: (i: number) => [...memory.keys()][i] ?? null,
      get length() {
        return memory.size;
      },
    },
  });
}

describe('local-store', () => {
  beforeEach(() => {
    installLocalStorageMock();
    localStorage.clear();
  });

  it('handles null bytes in corrupted localStorage JSON without throwing', () => {
    // Simula corrupção com bytes nulos (\0)
    localStorage.setItem(PREFIX + 'corrupted-key', '\0\0\0\0\0');
    const res = loadJson('corrupted-key', { fallback: true });
    expect(res).toEqual({ fallback: true });
  });

  it('salva e recupera dados normalmente', () => {
    saveJson('test-key', { a: 1, b: 'hello' });
    const res = loadJson('test-key', null);
    expect(res).toEqual({ a: 1, b: 'hello' });
  });

  it('enqueueSyncOp salva na fila offline caso o IPC falhe ou lance exceção', async () => {
    // Simula window.ferrogestor.enqueueSync lançando erro (como no caso do sync-queue corrompido)
    (globalThis as unknown as { window: unknown }).window = {
      ferrogestor: {
        enqueueSync: vi.fn().mockRejectedValue(new Error("Unexpected token '\0', '\0\0\0\0'... is not valid JSON")),
      },
    };

    await expect(
      enqueueSyncOp({
        entityType: 'Purchase',
        entityId: 'p-123',
        action: 'CREATE',
        payload: { id: 'p-123', total: 100 },
      }),
    ).resolves.not.toThrow();

    const offlineQueue = loadJson<Array<{ entityId: string }>>('offline-sync-queue', []);
    expect(offlineQueue.length).toBeGreaterThan(0);
    expect(offlineQueue[0]?.entityId).toBe('p-123');
  });
});
