import {
  type SyncOperation,
  type SyncPushResult,
  detectVersionConflict,
  getConflictStrategy,
  ConflictStrategy,
} from '@ferrogestor/shared';
import { Prisma, type CentralPrismaClient } from './central.js';

export class SyncCoreError extends Error {
  constructor(
    message: string,
    readonly code: 'UNAVAILABLE' | 'NOT_FOUND' | 'FORBIDDEN' = 'UNAVAILABLE',
  ) {
    super(message);
    this.name = 'SyncCoreError';
  }
}

export type SyncPullOperation = {
  originOperationId: string;
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  version: number;
  occurredAt: string;
  updatedAt: string;
};

export type SyncPullResult = {
  since: Date;
  serverTime: string;
  operations: SyncPullOperation[];
  receipts: Array<{
    originOperationId: string;
    entityType: string;
    entityId: string;
    processedAt: string;
  }>;
  nextSince: string | null;
  hasMore: boolean;
};

export function createSyncCore(db: CentralPrismaClient) {
  async function applyOperation(
    op: SyncOperation,
    userId: string,
  ): Promise<{ conflictId?: string; reason?: string }> {
    const strategy = getConflictStrategy(op.entityType);
    const payload = op.payload as Prisma.InputJsonValue;

    if (strategy === ConflictStrategy.MOVEMENT_ONLY && op.action === 'UPDATE') {
      const conflict = await db.syncConflict.create({
        data: {
          companyId: op.companyId,
          entityType: op.entityType,
          entityId: op.entityId,
          originOperationId: op.originOperationId,
          localPayload: payload,
          serverPayload: {},
          localVersion: op.version,
          serverVersion: 0,
          status: 'PENDING',
        },
      });
      return {
        conflictId: conflict.id,
        reason: 'Estoque não permite UPDATE direto; use movimentações',
      };
    }

    if (strategy === ConflictStrategy.REQUIRES_REVERSAL && op.action === 'DELETE') {
      const conflict = await db.syncConflict.create({
        data: {
          companyId: op.companyId,
          entityType: op.entityType,
          entityId: op.entityId,
          originOperationId: op.originOperationId,
          localPayload: payload,
          serverPayload: {},
          localVersion: op.version,
          serverVersion: 0,
          status: 'PENDING',
        },
      });
      return {
        conflictId: conflict.id,
        reason: 'Registro financeiro/operacional exige estorno, não exclusão',
      };
    }

    const current = await db.syncEntity.findUnique({
      where: { id: op.entityId },
    });

    if (
      current &&
      op.version === current.version &&
      op.action === 'UPDATE' &&
      strategy === ConflictStrategy.MANUAL
    ) {
      const conflict = await db.syncConflict.create({
        data: {
          companyId: op.companyId,
          entityType: op.entityType,
          entityId: op.entityId,
          originOperationId: op.originOperationId,
          localPayload: payload,
          serverPayload: current.payload as Prisma.InputJsonValue,
          localVersion: op.version,
          serverVersion: current.version,
          localUserId: userId,
          serverUserId: current.createdByUserId,
          localUpdatedAt: new Date(op.occurredAt),
          serverUpdatedAt: current.updatedAt,
          status: 'PENDING',
        },
      });
      return { conflictId: conflict.id, reason: 'Resolução manual necessária' };
    }

    if (
      current &&
      detectVersionConflict(op.version, current.version, current.version - 1) &&
      strategy === ConflictStrategy.MANUAL &&
      op.version <= current.version
    ) {
      const conflict = await db.syncConflict.create({
        data: {
          companyId: op.companyId,
          entityType: op.entityType,
          entityId: op.entityId,
          originOperationId: op.originOperationId,
          localPayload: payload,
          serverPayload: current.payload as Prisma.InputJsonValue,
          localVersion: op.version,
          serverVersion: current.version,
          status: 'PENDING',
        },
      });
      return { conflictId: conflict.id, reason: 'Conflito de versão' };
    }

    if (
      current &&
      op.version < current.version &&
      strategy === ConflictStrategy.LAST_WRITE_WINS
    ) {
      return {};
    }

    if (current && op.version === current.version && op.action === 'UPDATE') {
      const conflict = await db.syncConflict.create({
        data: {
          companyId: op.companyId,
          entityType: op.entityType,
          entityId: op.entityId,
          originOperationId: op.originOperationId,
          localPayload: payload,
          serverPayload: current.payload as Prisma.InputJsonValue,
          localVersion: op.version,
          serverVersion: current.version,
          status: 'PENDING',
        },
      });
      return {
        conflictId: conflict.id,
        reason: 'Mesma versão alterada em paralelo',
      };
    }

    const now = new Date();
    await db.syncEntity.upsert({
      where: { id: op.entityId },
      create: {
        id: op.entityId,
        companyId: op.companyId,
        branchId: op.branchId ?? null,
        deviceId: op.deviceId,
        entityType: op.entityType,
        version: op.version,
        payload,
        createdByUserId: userId,
        deletedAt: op.action === 'DELETE' ? now : null,
        originOperationId: op.originOperationId,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        companyId: op.companyId,
        branchId: op.branchId ?? null,
        deviceId: op.deviceId,
        entityType: op.entityType,
        version: op.version,
        payload,
        createdByUserId: userId,
        deletedAt: op.action === 'DELETE' ? now : null,
        originOperationId: op.originOperationId,
        updatedAt: now,
      },
    });

    await db.syncQueue.upsert({
      where: { originOperationId: op.originOperationId },
      create: {
        companyId: op.companyId,
        branchId: op.branchId ?? null,
        deviceId: op.deviceId,
        originOperationId: op.originOperationId,
        entityType: op.entityType,
        entityId: op.entityId,
        action: op.action,
        payload,
        version: op.version,
        status: 'SYNCED',
        occurredAt: new Date(op.occurredAt),
      },
      update: {
        companyId: op.companyId,
        branchId: op.branchId ?? null,
        deviceId: op.deviceId,
        entityType: op.entityType,
        entityId: op.entityId,
        action: op.action,
        payload,
        version: op.version,
        status: 'SYNCED',
        occurredAt: new Date(op.occurredAt),
      },
    });

    return {};
  }

  return {
    async push(
      companyId: string,
      deviceId: string,
      userId: string,
      operations: SyncOperation[],
    ): Promise<SyncPushResult> {
      const result: SyncPushResult = {
        accepted: [],
        conflicts: [],
        errors: [],
      };

      for (const op of operations) {
        try {
          if (op.companyId !== companyId) {
            result.errors.push({
              originOperationId: op.originOperationId,
              message: 'companyId não corresponde à sessão',
            });
            continue;
          }

          const existingReceipt = await db.syncOperationReceipt.findUnique({
            where: { originOperationId: op.originOperationId },
          });
          if (existingReceipt) {
            result.accepted.push(op.originOperationId);
            continue;
          }

          const applied = await applyOperation(op, userId);
          if (applied.conflictId) {
            result.conflicts.push({
              originOperationId: op.originOperationId,
              entityId: op.entityId,
              entityType: op.entityType,
              conflictId: applied.conflictId,
              reason: applied.reason ?? 'Conflito de versão',
            });
          } else {
            await db.syncOperationReceipt.create({
              data: {
                originOperationId: op.originOperationId,
                companyId,
                deviceId,
                entityType: op.entityType,
                entityId: op.entityId,
                result: 'ACCEPTED',
                processedAt: new Date(),
              },
            });
            result.accepted.push(op.originOperationId);
          }
        } catch (err) {
          result.errors.push({
            originOperationId: op.originOperationId,
            message: err instanceof Error ? err.message : 'Erro desconhecido',
          });
        }
      }

      await db.syncLog.create({
        data: {
          companyId,
          deviceId,
          direction: 'PUSH',
          startedAt: new Date(),
          finishedAt: new Date(),
          pushedCount: result.accepted.length,
          conflictCount: result.conflicts.length,
          errorCount: result.errors.length,
          success: result.errors.length === 0,
          details: result as unknown as Prisma.InputJsonValue,
        },
      });

      return result;
    },

    async pull(
      companyId: string,
      deviceId: string,
      since: Date,
      limit = 200,
    ): Promise<SyncPullResult> {
      const take = Math.min(Math.max(limit, 1), 500);
      const changes = await db.syncQueue.findMany({
        where: {
          companyId,
          status: 'SYNCED',
          updatedAt: { gt: since },
          deviceId: { not: deviceId },
        },
        orderBy: { updatedAt: 'asc' },
        take: take + 1,
      });

      const hasMore = changes.length > take;
      const page = hasMore ? changes.slice(0, take) : changes;
      const last = page[page.length - 1];

      const receipts = await db.syncOperationReceipt.findMany({
        where: {
          companyId,
          processedAt: { gt: since },
          deviceId: { not: deviceId },
        },
        orderBy: { processedAt: 'asc' },
        take,
      });

      await db.syncLog.create({
        data: {
          companyId,
          deviceId,
          direction: 'PULL',
          startedAt: new Date(),
          finishedAt: new Date(),
          pulledCount: page.length + receipts.length,
          success: true,
        },
      });

      return {
        since,
        serverTime: new Date().toISOString(),
        operations: page.map((c) => ({
          originOperationId: c.originOperationId,
          entityType: c.entityType,
          entityId: c.entityId,
          action: c.action,
          payload: c.payload as Record<string, unknown>,
          version: c.version,
          occurredAt: c.occurredAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
        receipts: receipts.map((r) => ({
          originOperationId: r.originOperationId,
          entityType: r.entityType,
          entityId: r.entityId,
          processedAt: r.processedAt.toISOString(),
        })),
        nextSince: last ? last.updatedAt.toISOString() : null,
        hasMore,
      };
    },

    async status(companyId: string) {
      const [pendingConflicts, recentLogs, pendingQueue] = await Promise.all([
        db.syncConflict.count({
          where: { companyId, status: 'PENDING' },
        }),
        db.syncLog.findMany({
          where: { companyId },
          orderBy: { startedAt: 'desc' },
          take: 20,
        }),
        db.syncQueue.count({
          where: { companyId, status: 'PENDING' },
        }),
      ]);

      return {
        pendingQueue,
        pendingConflicts,
        recentLogs,
        connection: 'online' as const,
        store: 'postgresql' as const,
      };
    },

    async listConflicts(companyId: string) {
      return db.syncConflict.findMany({
        where: { companyId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    },

    async resolveConflict(
      conflictId: string,
      companyId: string,
      userId: string,
      resolution: 'KEEP_LOCAL' | 'KEEP_SERVER' | 'MERGE',
      justification: string,
      mergedPayload?: Record<string, unknown>,
    ) {
      const conflict = await db.syncConflict.findFirst({
        where: { id: conflictId, companyId },
      });
      if (!conflict) {
        throw new SyncCoreError('Conflito não encontrado', 'NOT_FOUND');
      }

      await db.syncConflict.update({
        where: { id: conflictId },
        data: {
          status: resolution,
          resolution,
          justification,
          resolvedByUserId: userId,
          resolvedAt: new Date(),
        },
      });

      if (resolution === 'KEEP_LOCAL' || resolution === 'MERGE') {
        const payload =
          resolution === 'MERGE' && mergedPayload
            ? mergedPayload
            : (conflict.localPayload as Record<string, unknown>);
        const nextVersion =
          Math.max(conflict.localVersion, conflict.serverVersion) + 1;
        await db.syncEntity.update({
          where: { id: conflict.entityId },
          data: {
            payload: payload as Prisma.InputJsonValue,
            version: nextVersion,
            updatedAt: new Date(),
            createdByUserId: userId,
          },
        });
      }

      return { ok: true as const, conflictId, resolution };
    },
  };
}

export type SyncCore = ReturnType<typeof createSyncCore>;
