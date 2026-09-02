import { describe, expect, it, vi } from 'vitest';
import { createSyncCore } from './sync-core.js';
import type { CentralPrismaClient } from './central.js';
import type { SyncOperation } from '@ferrogestor/shared';

function uuid(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function makeOp(partial: Partial<SyncOperation> & Pick<SyncOperation, 'originOperationId' | 'entityId'>): SyncOperation {
  return {
    entityType: 'Contact',
    action: 'CREATE',
    payload: { name: 'Teste' },
    version: 1,
    companyId: uuid(1),
    branchId: uuid(2),
    deviceId: uuid(3),
    userId: uuid(4),
    occurredAt: new Date().toISOString(),
    ...partial,
  };
}

function createMockDb(overrides: Record<string, unknown> = {}) {
  const receipts = new Map<string, { originOperationId: string }>();
  const entities = new Map<string, { id: string; version: number; payload: unknown; updatedAt: Date; createdByUserId: string }>();
  const queue: Array<{
    originOperationId: string;
    companyId: string;
    deviceId: string;
    status: string;
    updatedAt: Date;
    entityType: string;
    entityId: string;
    action: string;
    payload: unknown;
    version: number;
    occurredAt: Date;
  }> = [];
  const conflicts: Array<{ id: string }> = [];

  const db = {
    syncOperationReceipt: {
      findUnique: vi.fn(async ({ where }: { where: { originOperationId: string } }) =>
        receipts.get(where.originOperationId) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: { originOperationId: string } }) => {
        receipts.set(data.originOperationId, data);
        return data;
      }),
      findMany: vi.fn(async () => []),
    },
    syncEntity: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        entities.get(where.id) ?? null,
      ),
      upsert: vi.fn(async ({ where, create, update }: {
        where: { id: string };
        create: { id: string; version: number; payload: unknown; createdByUserId: string };
        update: { version: number; payload: unknown; createdByUserId: string };
      }) => {
        const existing = entities.get(where.id);
        const next = existing
          ? { ...existing, ...update, updatedAt: new Date() }
          : { ...create, updatedAt: new Date() };
        entities.set(where.id, next);
        return next;
      }),
    },
    syncQueue: {
      upsert: vi.fn(async ({ create }: {
        create: {
          originOperationId: string;
          companyId: string;
          deviceId: string;
          entityType: string;
          entityId: string;
          action: string;
          payload: unknown;
          version: number;
          occurredAt: Date;
        };
      }) => {
        const row = {
          ...create,
          status: 'SYNCED',
          updatedAt: new Date(Date.now() + queue.length),
        };
        queue.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ take }: { take: number }) => {
        const sorted = [...queue].sort(
          (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
        );
        return sorted.slice(0, take);
      }),
    },
    syncConflict: {
      create: vi.fn(async () => {
        const row = { id: uuid(900 + conflicts.length) };
        conflicts.push(row);
        return row;
      }),
      count: vi.fn(async () => conflicts.length),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    syncLog: {
      create: vi.fn(async ({ data }: { data: unknown }) => data),
      findMany: vi.fn(async () => []),
    },
    ...overrides,
  };

  return { db: db as unknown as CentralPrismaClient, receipts, entities, queue, conflicts };
}

describe('createSyncCore', () => {
  it('aceita push e é idempotente no segundo envio', async () => {
    const { db, receipts } = createMockDb();
    const core = createSyncCore(db);
    const op = makeOp({
      originOperationId: uuid(10),
      entityId: uuid(11),
    });

    const first = await core.push(uuid(1), uuid(3), uuid(4), [op]);
    expect(first.accepted).toEqual([op.originOperationId]);
    expect(first.conflicts).toHaveLength(0);
    expect(receipts.size).toBe(1);

    const second = await core.push(uuid(1), uuid(3), uuid(4), [op]);
    expect(second.accepted).toEqual([op.originOperationId]);
    expect(second.errors).toHaveLength(0);
  });

  it('detecta conflito MANUAL na mesma versão', async () => {
    const { db, entities } = createMockDb();
    entities.set(uuid(21), {
      id: uuid(21),
      version: 1,
      payload: { name: 'A' },
      updatedAt: new Date(),
      createdByUserId: uuid(4),
    });
    const core = createSyncCore(db);
    const op = makeOp({
      originOperationId: uuid(20),
      entityId: uuid(21),
      action: 'UPDATE',
      version: 1,
      payload: { name: 'B' },
    });

    const result = await core.push(uuid(1), uuid(3), uuid(4), [op]);
    expect(result.accepted).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.reason).toMatch(/versão|manual|paralelo/i);
  });

  it('pagina o pull com hasMore quando há mais que o limite', async () => {
    const { db, queue } = createMockDb();
    for (let i = 0; i < 5; i++) {
      queue.push({
        originOperationId: uuid(100 + i),
        companyId: uuid(1),
        deviceId: uuid(99),
        status: 'SYNCED',
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        entityType: 'Contact',
        entityId: uuid(200 + i),
        action: 'CREATE',
        payload: {},
        version: 1,
        occurredAt: new Date(),
      });
    }

    const core = createSyncCore(db);
    const page1 = await core.pull(uuid(1), uuid(3), new Date(0), 2);
    expect(page1.operations).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextSince).toBeTruthy();

    // Simula cursor: findMany filtra por take; para o teste basta validar hasMore.
    const pageFull = await core.pull(uuid(1), uuid(3), new Date(0), 10);
    expect(pageFull.operations.length).toBeLessThanOrEqual(5);
    expect(pageFull.hasMore).toBe(false);
  });
});
