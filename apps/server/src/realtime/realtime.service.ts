import { Injectable, Inject } from '@nestjs/common';
import type { SyncOperation, SyncPushResult } from '@ferrogestor/shared';
import { PrismaService } from '../prisma/prisma.module.js';
import { applyEntityOp } from './entity-applier.js';

@Injectable()
export class RealtimeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
            message: 'companyId não corresponde ao token',
          });
          continue;
        }

        const existing = await this.prisma.db.syncOperationReceipt.findUnique({
          where: { originOperationId: op.originOperationId },
        });
        if (existing) {
          result.accepted.push(op.originOperationId);
          continue;
        }

        await applyEntityOp(this.prisma.db, op, userId);

        const now = new Date();
        await this.prisma.db.syncQueue.upsert({
          where: { originOperationId: op.originOperationId },
          create: {
            companyId: op.companyId,
            branchId: op.branchId ?? undefined,
            deviceId: op.deviceId,
            originOperationId: op.originOperationId,
            entityType: op.entityType,
            entityId: op.entityId,
            action: op.action,
            payload: op.payload as object,
            version: op.version,
            status: 'SYNCED',
            occurredAt: new Date(op.occurredAt),
            updatedAt: now,
          },
          update: {
            entityType: op.entityType,
            entityId: op.entityId,
            action: op.action,
            payload: op.payload as object,
            version: op.version,
            status: 'SYNCED',
            occurredAt: new Date(op.occurredAt),
            updatedAt: now,
            lastError: null,
          },
        });

        await this.prisma.db.syncOperationReceipt.create({
          data: {
            originOperationId: op.originOperationId,
            companyId,
            deviceId,
            entityType: op.entityType,
            entityId: op.entityId,
            result: 'ACCEPTED',
          },
        });

        await this.prisma.db.syncLog.create({
          data: {
            companyId,
            deviceId,
            direction: 'PUSH',
            startedAt: now,
            finishedAt: now,
            pushedCount: 1,
            success: true,
          },
        });

        result.accepted.push(op.originOperationId);
      } catch (err) {
        result.errors.push({
          originOperationId: op.originOperationId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  async pull(companyId: string, deviceId: string, since: Date, limit: number) {
    const rows = await this.prisma.db.syncQueue.findMany({
      where: {
        companyId,
        status: 'SYNCED',
        updatedAt: { gt: since },
        NOT: { deviceId },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    return {
      since: since.toISOString(),
      serverTime: new Date().toISOString(),
      operations: rows.map((r) => ({
        originOperationId: r.originOperationId,
        entityType: r.entityType,
        entityId: r.entityId,
        action: r.action,
        payload: r.payload,
        version: r.version,
        companyId: r.companyId,
        branchId: r.branchId,
        deviceId: r.deviceId,
        userId: '',
        occurredAt: r.occurredAt.toISOString(),
      })),
    };
  }

  async status(companyId: string) {
    const pending = await this.prisma.db.syncQueue.count({
      where: { companyId, status: 'PENDING' },
    });
    const errors = await this.prisma.db.syncQueue.count({
      where: { companyId, status: 'ERROR' },
    });
    const last = await this.prisma.db.syncLog.findFirst({
      where: { companyId, direction: 'PUSH', success: true },
      orderBy: { startedAt: 'desc' },
    });
    return {
      pending,
      errors,
      lastPushAt: last?.finishedAt?.toISOString() ?? null,
      database: 'postgresql',
    };
  }
}
