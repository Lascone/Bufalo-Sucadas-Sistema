import { describe, expect, it } from 'vitest';
import {
  buildIdempotencyKey,
  detectVersionConflict,
  isNewerVersion,
  syncOperationSchema,
  syncPushRequestSchema,
} from './sync.js';
import { getConflictStrategy } from './conflicts.js';
import { ConflictStrategy } from './constants.js';

describe('sync helpers', () => {
  it('detects version conflicts', () => {
    expect(detectVersionConflict(2, 3, 1)).toBe(true);
    expect(detectVersionConflict(2, 2, 1)).toBe(false);
    expect(detectVersionConflict(1, 2, 1)).toBe(false);
  });

  it('compares versions', () => {
    expect(isNewerVersion(3, 2)).toBe(true);
    expect(isNewerVersion(2, 3)).toBe(false);
  });

  it('builds idempotency keys', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(buildIdempotencyKey(id)).toBe(`op:${id}`);
  });

  it('validates push payload', () => {
    const op = {
      originOperationId: '550e8400-e29b-41d4-a716-446655440000',
      entityType: 'Contact',
      entityId: '550e8400-e29b-41d4-a716-446655440001',
      action: 'CREATE' as const,
      payload: { name: 'Brasília Metais' },
      version: 1,
      companyId: '550e8400-e29b-41d4-a716-446655440002',
      deviceId: '550e8400-e29b-41d4-a716-446655440003',
      userId: '550e8400-e29b-41d4-a716-446655440004',
      occurredAt: new Date().toISOString(),
    };
    expect(syncOperationSchema.parse(op).entityType).toBe('Contact');
    expect(
      syncPushRequestSchema.parse({
        deviceId: op.deviceId,
        operations: [op],
      }).operations,
    ).toHaveLength(1);
  });
});

describe('conflict strategy', () => {
  it('maps stock to movement-only', () => {
    expect(getConflictStrategy('StockMovement')).toBe(
      ConflictStrategy.MOVEMENT_ONLY,
    );
  });

  it('maps purchases to requires-reversal', () => {
    expect(getConflictStrategy('Purchase')).toBe(
      ConflictStrategy.REQUIRES_REVERSAL,
    );
  });

  it('defaults unknown entities to manual', () => {
    expect(getConflictStrategy('UnknownThing')).toBe(ConflictStrategy.MANUAL);
  });
});
