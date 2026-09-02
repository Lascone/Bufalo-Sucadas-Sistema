import {
  Injectable,
  Inject,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { type SyncOperation, type SyncPushResult } from '@ferrogestor/shared';
import { createSyncCore, SyncCoreError } from '@ferrogestor/database';
import { PrismaService } from '../prisma/prisma.module.js';

@Injectable()
export class SyncService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private core() {
    if (!this.prisma.db) {
      throw new ServiceUnavailableException(
        'PostgreSQL indisponível — configure DATABASE_URL',
      );
    }
    return createSyncCore(this.prisma.db);
  }

  private mapError(err: unknown): never {
    if (err instanceof SyncCoreError) {
      if (err.code === 'NOT_FOUND') throw new NotFoundException(err.message);
      throw new ServiceUnavailableException(err.message);
    }
    throw err;
  }

  async push(
    companyId: string,
    deviceId: string,
    userId: string,
    operations: SyncOperation[],
  ): Promise<SyncPushResult> {
    try {
      return await this.core().push(companyId, deviceId, userId, operations);
    } catch (err) {
      this.mapError(err);
    }
  }

  async pull(companyId: string, deviceId: string, since: Date, limit: number) {
    try {
      return await this.core().pull(companyId, deviceId, since, limit);
    } catch (err) {
      this.mapError(err);
    }
  }

  async status(companyId: string) {
    try {
      return await this.core().status(companyId);
    } catch (err) {
      this.mapError(err);
    }
  }

  async listConflicts(companyId: string) {
    try {
      return await this.core().listConflicts(companyId);
    } catch (err) {
      this.mapError(err);
    }
  }

  async resolveConflict(
    conflictId: string,
    companyId: string,
    userId: string,
    resolution: 'KEEP_LOCAL' | 'KEEP_SERVER' | 'MERGE',
    justification: string,
    mergedPayload?: Record<string, unknown>,
  ) {
    try {
      return await this.core().resolveConflict(
        conflictId,
        companyId,
        userId,
        resolution,
        justification,
        mergedPayload,
      );
    } catch (err) {
      this.mapError(err);
    }
  }
}
