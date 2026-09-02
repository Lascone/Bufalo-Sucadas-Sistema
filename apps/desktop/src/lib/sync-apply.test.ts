import { describe, expect, it, beforeEach } from 'vitest';
import { applyRemoteOperations } from './sync-apply';

const PREFIX = 'ferrogestor:';

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

describe('applyRemoteOperations (2 PCs / pull)', () => {
  beforeEach(() => {
    memory.clear();
    installLocalStorageMock();
  });

  it('insere compra puxada do outro PC', () => {
    const { applied } = applyRemoteOperations([
      {
        originOperationId: 'op-1',
        entityType: 'Purchase',
        entityId: 'p-1',
        action: 'CREATE',
        payload: { id: 'p-1', personName: 'João', total: 100 },
        version: 1,
        occurredAt: new Date().toISOString(),
      },
    ]);
    expect(applied).toBe(1);
    const raw = localStorage.getItem(PREFIX + 'purchases');
    expect(raw).toBeTruthy();
    const list = JSON.parse(raw!) as Array<{ id: string; personName: string }>;
    expect(list[0]?.id).toBe('p-1');
    expect(list[0]?.personName).toBe('João');
  });

  it('não sobrescreve se local version for maior', () => {
    localStorage.setItem(
      PREFIX + 'materials',
      JSON.stringify([{ id: 'm-1', name: 'Local', version: 5 }]),
    );
    applyRemoteOperations([
      {
        originOperationId: 'op-2',
        entityType: 'Material',
        entityId: 'm-1',
        action: 'UPDATE',
        payload: { id: 'm-1', name: 'Remoto', version: 2 },
        version: 2,
        occurredAt: new Date().toISOString(),
      },
    ]);
    const list = JSON.parse(
      localStorage.getItem(PREFIX + 'materials')!,
    ) as Array<{ name: string }>;
    expect(list[0]?.name).toBe('Local');
  });

  it('aplica movimento de caixa aninhado', () => {
    localStorage.setItem(
      PREFIX + 'cash-registers',
      JSON.stringify([{ id: 'c-1', status: 'OPEN', movements: [] }]),
    );
    applyRemoteOperations([
      {
        originOperationId: 'op-3',
        entityType: 'CashRegisterMovement',
        entityId: 'mov-1',
        action: 'CREATE',
        payload: {
          id: 'mov-1',
          cashRegisterId: 'c-1',
          amount: 50,
          movementType: 'DESPESA',
        },
        version: 1,
        occurredAt: new Date().toISOString(),
      },
    ]);
    const cash = JSON.parse(
      localStorage.getItem(PREFIX + 'cash-registers')!,
    ) as Array<{ movements: Array<{ id: string }> }>;
    expect(cash[0]?.movements[0]?.id).toBe('mov-1');
  });
});
