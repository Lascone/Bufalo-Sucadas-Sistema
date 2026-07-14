import { Injectable } from '@nestjs/common';
import {
  type SyncOperation,
  type SyncPushResult,
  detectVersionConflict,
  getConflictStrategy,
} from '@ferrogestor/shared';
import { ConflictStrategy } from '@ferrogestor/shared';
import { PrismaService } from '../prisma/prisma.module.js';

const ENTITY_DELEGATES = [
  'contact',
  'material',
  'materialCategory',
  'materialPrice',
  'companyPriceTable',
  'purchase',
  'purchaseItem',
  'weighing',
  'sale',
  'saleItem',
  'stockMovement',
  'stockProcessing',
  'financialAccount',
  'financialTransaction',
  'accountPayable',
  'accountReceivable',
  'companyCredit',
  'companyCreditMovement',
  'cashRegister',
  'cashRegisterMovement',
  'attachment',
  'applicationSetting',
  'warehouse',
  'branch',
] as const;

type EntityDelegateName = (typeof ENTITY_DELEGATES)[number];

function toDelegateName(entityType: string): EntityDelegateName | null {
  const map: Record<string, EntityDelegateName> = {
    Contact: 'contact',
    Material: 'material',
    MaterialCategory: 'materialCategory',
    MaterialPrice: 'materialPrice',
    CompanyPriceTable: 'companyPriceTable',
    Purchase: 'purchase',
    PurchaseItem: 'purchaseItem',
    Weighing: 'weighing',
    Sale: 'sale',
    SaleItem: 'saleItem',
    StockMovement: 'stockMovement',
    StockProcessing: 'stockProcessing',
    FinancialAccount: 'financialAccount',
    FinancialTransaction: 'financialTransaction',
    AccountPayable: 'accountPayable',
    AccountReceivable: 'accountReceivable',
    CompanyCredit: 'companyCredit',
    CompanyCreditMovement: 'companyCreditMovement',
    CashRegister: 'cashRegister',
    CashRegisterMovement: 'cashRegisterMovement',
    Attachment: 'attachment',
    ApplicationSetting: 'applicationSetting',
    Warehouse: 'warehouse',
    Branch: 'branch',
  };
  return map[entityType] ?? null;
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

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

        const existingReceipt = await this.prisma.db.syncOperationReceipt.findUnique({
          where: { originOperationId: op.originOperationId },
        });
        if (existingReceipt) {
          result.accepted.push(op.originOperationId);
          continue;
        }

        const applied = await this.applyOperation(op, userId);
        if (applied.conflictId) {
          result.conflicts.push({
            originOperationId: op.originOperationId,
            entityId: op.entityId,
            entityType: op.entityType,
            conflictId: applied.conflictId,
            reason: applied.reason ?? 'Conflito de versão',
          });
        } else {
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
          result.accepted.push(op.originOperationId);
        }
      } catch (err) {
        result.errors.push({
          originOperationId: op.originOperationId,
          message: err instanceof Error ? err.message : 'Erro desconhecido',
        });
      }
    }

    await this.prisma.db.syncLog.create({
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
        details: result as object,
      },
    });

    return result;
  }

  private async applyOperation(
    op: SyncOperation,
    userId: string,
  ): Promise<{ conflictId?: string; reason?: string }> {
    const strategy = getConflictStrategy(op.entityType);
    const delegateName = toDelegateName(op.entityType);

    if (strategy === ConflictStrategy.MOVEMENT_ONLY && op.action === 'UPDATE') {
      const conflict = await this.prisma.db.syncConflict.create({
        data: {
          companyId: op.companyId,
          entityType: op.entityType,
          entityId: op.entityId,
          originOperationId: op.originOperationId,
          localPayload: op.payload as object,
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
      const conflict = await this.prisma.db.syncConflict.create({
        data: {
          companyId: op.companyId,
          entityType: op.entityType,
          entityId: op.entityId,
          originOperationId: op.originOperationId,
          localPayload: op.payload as object,
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

    if (!delegateName) {
      // Generic queue mirror for unsupported entities in foundation
      await this.prisma.db.syncQueue.create({
        data: {
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
        },
      });
      return {};
    }

    const model = this.prisma.db[delegateName] as unknown as {
      findUnique: (args: { where: { id: string } }) => Promise<{
        id: string;
        version: number;
        updatedAt: Date;
        createdByUserId: string | null;
      } | null>;
      upsert: (args: unknown) => Promise<unknown>;
      update: (args: unknown) => Promise<unknown>;
    };

    const current = await model.findUnique({ where: { id: op.entityId } });

    if (current && detectVersionConflict(op.version, current.version, current.version - 1)) {
      // Concurrent edit: incoming version != server version and not a simple increment path
      if (
        strategy === ConflictStrategy.MANUAL ||
        (strategy === ConflictStrategy.LAST_WRITE_WINS &&
          op.version === current.version)
      ) {
        if (op.version <= current.version && strategy === ConflictStrategy.MANUAL) {
          const conflict = await this.prisma.db.syncConflict.create({
            data: {
              companyId: op.companyId,
              entityType: op.entityType,
              entityId: op.entityId,
              originOperationId: op.originOperationId,
              localPayload: op.payload as object,
              serverPayload: current as unknown as object,
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
      }
    }

    if (current && op.version < current.version && strategy === ConflictStrategy.LAST_WRITE_WINS) {
      // Server already newer — accept but no overwrite (idempotent ack)
      return {};
    }

    if (current && op.version === current.version && op.action === 'UPDATE') {
      const conflict = await this.prisma.db.syncConflict.create({
        data: {
          companyId: op.companyId,
          entityType: op.entityType,
          entityId: op.entityId,
          originOperationId: op.originOperationId,
          localPayload: op.payload as object,
          serverPayload: current as unknown as object,
          localVersion: op.version,
          serverVersion: current.version,
          status: 'PENDING',
        },
      });
      return { conflictId: conflict.id, reason: 'Mesma versão alterada em paralelo' };
    }

    const baseData = {
      ...(op.payload as Record<string, unknown>),
      id: op.entityId,
      companyId: op.companyId,
      branchId: op.branchId ?? undefined,
      deviceId: op.deviceId,
      version: op.version,
      syncStatus: 'SYNCED',
      syncedAt: new Date(),
      originOperationId: op.originOperationId,
      createdByUserId: userId,
      deletedAt: op.action === 'DELETE' ? new Date() : null,
    };

    await model.upsert({
      where: { id: op.entityId },
      create: baseData,
      update: {
        ...baseData,
        updatedAt: new Date(),
      },
    });

    return {};
  }

  async pull(companyId: string, deviceId: string, since: Date, limit: number) {
    const changes = await this.prisma.db.syncQueue.findMany({
      where: {
        companyId,
        status: 'SYNCED',
        updatedAt: { gt: since },
        NOT: { deviceId },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });

    // Also surface accepted entity updates via receipts as lightweight markers
    const receipts = await this.prisma.db.syncOperationReceipt.findMany({
      where: {
        companyId,
        processedAt: { gt: since },
        NOT: { deviceId },
      },
      orderBy: { processedAt: 'asc' },
      take: limit,
    });

    await this.prisma.db.syncLog.create({
      data: {
        companyId,
        deviceId,
        direction: 'PULL',
        startedAt: new Date(),
        finishedAt: new Date(),
        pulledCount: changes.length + receipts.length,
        success: true,
      },
    });

    return {
      since,
      serverTime: new Date().toISOString(),
      operations: changes.map((c) => ({
        originOperationId: c.originOperationId,
        entityType: c.entityType,
        entityId: c.entityId,
        action: c.action,
        payload: c.payload,
        version: c.version,
        occurredAt: c.occurredAt.toISOString(),
      })),
      receipts: receipts.map((r) => ({
        originOperationId: r.originOperationId,
        entityType: r.entityType,
        entityId: r.entityId,
        processedAt: r.processedAt.toISOString(),
      })),
    };
  }

  async status(companyId: string) {
    const [pendingConflicts, recentLogs, pendingQueue] = await Promise.all([
      this.prisma.db.syncConflict.count({
        where: { companyId, status: 'PENDING' },
      }),
      this.prisma.db.syncLog.findMany({
        where: { companyId },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
      this.prisma.db.syncQueue.count({
        where: { companyId, status: 'PENDING' },
      }),
    ]);

    return {
      pendingQueue,
      pendingConflicts,
      recentLogs,
      connection: 'online',
    };
  }

  async resolveConflict(
    conflictId: string,
    companyId: string,
    userId: string,
    resolution: 'KEEP_LOCAL' | 'KEEP_SERVER' | 'MERGE',
    justification: string,
    mergedPayload?: Record<string, unknown>,
  ) {
    const conflict = await this.prisma.db.syncConflict.findFirst({
      where: { id: conflictId, companyId },
    });
    if (!conflict) {
      throw new Error('Conflito não encontrado');
    }

    await this.prisma.db.syncConflict.update({
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
      const delegateName = toDelegateName(conflict.entityType);
      if (delegateName) {
        const model = this.prisma.db[delegateName] as unknown as {
          update: (args: unknown) => Promise<unknown>;
        };
        await model.update({
          where: { id: conflict.entityId },
          data: {
            ...payload,
            version: Math.max(conflict.localVersion, conflict.serverVersion) + 1,
            syncStatus: 'SYNCED',
            syncedAt: new Date(),
          },
        });
      }
    }

    await this.prisma.db.auditLog.create({
      data: {
        companyId,
        userId,
        action: 'CONFLICT_RESOLVED',
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        reason: justification,
        afterData: { resolution, mergedPayload } as object,
      },
    });

    return { ok: true, conflictId, resolution };
  }
}
