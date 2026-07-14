import { describe, expect, it } from 'vitest';
import {
  buildIdempotencyKey,
  detectVersionConflict,
} from '@ferrogestor/shared';

describe('server sync contracts', () => {
  it('idempotency key is stable', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(buildIdempotencyKey(id)).toBe(`op:${id}`);
    expect(buildIdempotencyKey(id)).toBe(buildIdempotencyKey(id));
  });

  it('flags parallel edits as conflict', () => {
    expect(detectVersionConflict(5, 6, 4)).toBe(true);
  });
});
