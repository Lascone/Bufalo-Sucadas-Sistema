import { Injectable, Inject, ServiceUnavailableException } from '@nestjs/common';
import {
  type SyncOperation,
  type SyncPushResult,
  detectVersionConflict,
  getConflictStrategy,
  ConflictStrategy,
} from '@ferrogestor/shared';
import { MongoService } from '../mongo/mongo.module.js';
import {
  SyncConflictModel,
  SyncEntityModel,
  SyncLogModel,
  SyncQueueModel,
  SyncReceiptModel,
} from '../mongo/mongo.schemas.js';

@Injectable()
export class SyncService {
  constructor(@Inject(MongoService) private readonly mongo: MongoService) {}

  private ensureMongo() {
    if (!this.mongo.isReady()) {
      throw new ServiceUnavailableException(
        'MongoDB indisponível — configure MONGODB_URI e verifique a conexão',
      );
    }
  }

  async push(
    companyId: string,
    deviceId: string,
    userId: string,
    operations: SyncOperation[],
  ): Promise<SyncPushResult> {
    this.ensureMongo();
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

        const existingReceipt = await SyncReceiptModel.findOne({
          originOperationId: op.originOperationId,
        }).lean();
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
          await SyncReceiptModel.create({
            originOperationId: op.originOperationId,
            companyId,
            deviceId,
            entityType: op.entityType,
            entityId: op.entityId,
            result: 'ACCEPTED',
            processedAt: new Date(),
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

    await SyncLogModel.create({
      companyId,
      deviceId,
      direction: 'PUSH',
      startedAt: new Date(),
      finishedAt: new Date(),
      pushedCount: result.accepted.length,
      conflictCount: result.conflicts.length,
      errorCount: result.errors.length,
      success: result.errors.length === 0,
      details: result,
    });

    return result;
  }

  private async applyOperation(
    op: SyncOperation,
    userId: string,
  ): Promise<{ conflictId?: string; reason?: string }> {
    const strategy = getConflictStrategy(op.entityType);

    if (strategy === ConflictStrategy.MOVEMENT_ONLY && op.action === 'UPDATE') {
      const conflict = await SyncConflictModel.create({
        companyId: op.companyId,
        entityType: op.entityType,
        entityId: op.entityId,
        originOperationId: op.originOperationId,
        localPayload: op.payload,
        serverPayload: {},
        localVersion: op.version,
        serverVersion: 0,
        status: 'PENDING',
      });
      return {
        conflictId: conflict._id,
        reason: 'Estoque não permite UPDATE direto; use movimentações',
      };
    }

    if (strategy === ConflictStrategy.REQUIRES_REVERSAL && op.action === 'DELETE') {
      const conflict = await SyncConflictModel.create({
        companyId: op.companyId,
        entityType: op.entityType,
        entityId: op.entityId,
        originOperationId: op.originOperationId,
        localPayload: op.payload,
        serverPayload: {},
        localVersion: op.version,
        serverVersion: 0,
        status: 'PENDING',
      });
      return {
        conflictId: conflict._id,
        reason: 'Registro financeiro/operacional exige estorno, não exclusão',
      };
    }

    const current = await SyncEntityModel.findById(op.entityId).lean();

    if (
      current &&
      op.version === current.version &&
      op.action === 'UPDATE' &&
      strategy === ConflictStrategy.MANUAL
    ) {
      const conflict = await SyncConflictModel.create({
        companyId: op.companyId,
        entityType: op.entityType,
        entityId: op.entityId,
        originOperationId: op.originOperationId,
        localPayload: op.payload,
        serverPayload: current.payload,
        localVersion: op.version,
        serverVersion: current.version,
        localUserId: userId,
        serverUserId: current.createdByUserId,
        localUpdatedAt: new Date(op.occurredAt),
        serverUpdatedAt: current.updatedAt,
        status: 'PENDING',
      });
      return { conflictId: conflict._id, reason: 'Resolução manual necessária' };
    }

    if (
      current &&
      detectVersionConflict(op.version, current.version, current.version - 1) &&
      strategy === ConflictStrategy.MANUAL &&
      op.version <= current.version
    ) {
      const conflict = await SyncConflictModel.create({
        companyId: op.companyId,
        entityType: op.entityType,
        entityId: op.entityId,
        originOperationId: op.originOperationId,
        localPayload: op.payload,
        serverPayload: current.payload,
        localVersion: op.version,
        serverVersion: current.version,
        status: 'PENDING',
      });
      return { conflictId: conflict._id, reason: 'Conflito de versão' };
    }

    if (
      current &&
      op.version < current.version &&
      strategy === ConflictStrategy.LAST_WRITE_WINS
    ) {
      return {};
    }

    if (current && op.version === current.version && op.action === 'UPDATE') {
      const conflict = await SyncConflictModel.create({
        companyId: op.companyId,
        entityType: op.entityType,
        entityId: op.entityId,
        originOperationId: op.originOperationId,
        localPayload: op.payload,
        serverPayload: current.payload,
        localVersion: op.version,
        serverVersion: current.version,
        status: 'PENDING',
      });
      return { conflictId: conflict._id, reason: 'Mesma versão alterada em paralelo' };
    }

    const now = new Date();
    await SyncEntityModel.findByIdAndUpdate(
      op.entityId,
      {
        _id: op.entityId,
        companyId: op.companyId,
        branchId: op.branchId ?? undefined,
        deviceId: op.deviceId,
        entityType: op.entityType,
        version: op.version,
        payload: op.payload,
        createdByUserId: userId,
        deletedAt: op.action === 'DELETE' ? now : null,
        originOperationId: op.originOperationId,
        updatedAt: now,
        createdAt: current?.createdAt ?? now,
      },
      { upsert: true, new: true },
    );

    await SyncQueueModel.findOneAndUpdate(
      { originOperationId: op.originOperationId },
      {
        companyId: op.companyId,
        branchId: op.branchId ?? undefined,
        deviceId: op.deviceId,
        originOperationId: op.originOperationId,
        entityType: op.entityType,
        entityId: op.entityId,
        action: op.action,
        payload: op.payload,
        version: op.version,
        status: 'SYNCED',
        occurredAt: new Date(op.occurredAt),
        updatedAt: now,
      },
      { upsert: true, new: true },
    );

    return {};
  }

  async pull(companyId: string, deviceId: string, since: Date, limit: number) {
    this.ensureMongo();

    const changes = await SyncQueueModel.find({
      companyId,
      status: 'SYNCED',
      updatedAt: { $gt: since },
      deviceId: { $ne: deviceId },
    })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .lean();

    const receipts = await SyncReceiptModel.find({
      companyId,
      processedAt: { $gt: since },
      deviceId: { $ne: deviceId },
    })
      .sort({ processedAt: 1 })
      .limit(limit)
      .lean();

    await SyncLogModel.create({
      companyId,
      deviceId,
      direction: 'PULL',
      startedAt: new Date(),
      finishedAt: new Date(),
      pulledCount: changes.length + receipts.length,
      success: true,
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
        occurredAt: new Date(c.occurredAt).toISOString(),
      })),
      receipts: receipts.map((r) => ({
        originOperationId: r.originOperationId,
        entityType: r.entityType,
        entityId: r.entityId,
        processedAt: new Date(r.processedAt).toISOString(),
      })),
    };
  }

  async status(companyId: string) {
    this.ensureMongo();
    const [pendingConflicts, recentLogs, pendingQueue] = await Promise.all([
      SyncConflictModel.countDocuments({ companyId, status: 'PENDING' }),
      SyncLogModel.find({ companyId }).sort({ startedAt: -1 }).limit(20).lean(),
      SyncQueueModel.countDocuments({ companyId, status: 'PENDING' }),
    ]);

    return {
      pendingQueue,
      pendingConflicts,
      recentLogs,
      connection: 'online',
      store: 'mongodb',
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
    this.ensureMongo();
    const conflict = await SyncConflictModel.findOne({
      _id: conflictId,
      companyId,
    });
    if (!conflict) {
      throw new Error('Conflito não encontrado');
    }

    conflict.status = resolution;
    conflict.resolution = resolution;
    conflict.justification = justification;
    conflict.resolvedByUserId = userId;
    conflict.resolvedAt = new Date();
    conflict.updatedAt = new Date();
    await conflict.save();

    if (resolution === 'KEEP_LOCAL' || resolution === 'MERGE') {
      const payload =
        resolution === 'MERGE' && mergedPayload
          ? mergedPayload
          : (conflict.localPayload as Record<string, unknown>);
      const nextVersion =
        Math.max(conflict.localVersion, conflict.serverVersion) + 1;
      await SyncEntityModel.findByIdAndUpdate(conflict.entityId, {
        payload,
        version: nextVersion,
        updatedAt: new Date(),
        createdByUserId: userId,
      });
    }

    return { ok: true, conflictId, resolution };
  }
}
