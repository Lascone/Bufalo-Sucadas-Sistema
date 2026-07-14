import { z } from 'zod';
import { SyncStatus } from './constants.js';

export const syncStatusSchema = z.enum([
  SyncStatus.SYNCED,
  SyncStatus.PENDING,
  SyncStatus.SYNCING,
  SyncStatus.CONFLICT,
  SyncStatus.ERROR,
  SyncStatus.CANCELLED,
]);

export const syncOperationSchema = z.object({
  originOperationId: z.string().uuid(),
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'RESTORE']),
  payload: z.record(z.unknown()),
  version: z.number().int().positive(),
  companyId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  deviceId: z.string().uuid(),
  userId: z.string().uuid(),
  occurredAt: z.string().datetime(),
});

export type SyncOperation = z.infer<typeof syncOperationSchema>;

export const syncPushRequestSchema = z.object({
  deviceId: z.string().uuid(),
  operations: z.array(syncOperationSchema).min(1).max(100),
});

export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncPushResultSchema = z.object({
  accepted: z.array(z.string().uuid()),
  conflicts: z.array(
    z.object({
      originOperationId: z.string().uuid(),
      entityId: z.string().uuid(),
      entityType: z.string(),
      conflictId: z.string().uuid(),
      reason: z.string(),
    }),
  ),
  errors: z.array(
    z.object({
      originOperationId: z.string().uuid(),
      message: z.string(),
    }),
  ),
});

export type SyncPushResult = z.infer<typeof syncPushResultSchema>;

export const syncPullQuerySchema = z.object({
  since: z.string().datetime(),
  deviceId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

export const deviceAuthSchema = z.object({
  deviceId: z.string().uuid(),
  deviceSecret: z.string().min(16),
  username: z.string().min(1),
  password: z.string().min(1),
});

export type DeviceAuthRequest = z.infer<typeof deviceAuthSchema>;

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceId: z.string().uuid().optional(),
});

export type LoginRequest = z.infer<typeof loginSchema>;

export const resolveConflictSchema = z.object({
  resolution: z.enum(['KEEP_LOCAL', 'KEEP_SERVER', 'MERGE']),
  justification: z.string().min(3).max(2000),
  mergedPayload: z.record(z.unknown()).optional(),
});

export type ResolveConflictRequest = z.infer<typeof resolveConflictSchema>;

/** Pure helpers for sync conflict detection / idempotency tests */
export function isNewerVersion(localVersion: number, remoteVersion: number): boolean {
  return localVersion > remoteVersion;
}

export function detectVersionConflict(
  localVersion: number,
  remoteVersion: number,
  baseVersion: number,
): boolean {
  return localVersion !== baseVersion && remoteVersion !== baseVersion && localVersion !== remoteVersion;
}

export function buildIdempotencyKey(originOperationId: string): string {
  return `op:${originOperationId}`;
}
