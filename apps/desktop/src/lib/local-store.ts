const PREFIX = 'ferrogestor:';

export { PREFIX };

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function enqueueSyncOp(input: {
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  payload: Record<string, unknown>;
  version?: number;
}) {
  const session = loadJson('session', {
    companyId: '00000000-0000-4000-8000-000000000010',
    branchId: '00000000-0000-4000-8000-000000000011',
    deviceId: '00000000-0000-4000-8000-000000000012',
    userId: '00000000-0000-4000-8000-000000000013',
  });

  let version = input.version;
  if (version === undefined) {
    if (input.action === 'CREATE') {
      version = 1;
    } else {
      // Bump: UPDATE/DELETE sobe a partir da versão no payload ou 2
      const fromPayload = Number(input.payload.version);
      version = Number.isFinite(fromPayload) && fromPayload > 0 ? fromPayload + 1 : 2;
    }
  }

  const op = {
    originOperationId: newId(),
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: { ...input.payload, version },
    version,
    companyId: session.companyId,
    branchId: session.branchId,
    deviceId: session.deviceId,
    userId: session.userId,
    occurredAt: new Date().toISOString(),
    status: 'PENDING' as const,
  };

  if (window.ferrogestor?.enqueueSync) {
    await window.ferrogestor.enqueueSync(op);
  } else {
    const pending = loadJson<unknown[]>('offline-sync-queue', []);
    pending.push(op);
    saveJson('offline-sync-queue', pending);
  }
}
