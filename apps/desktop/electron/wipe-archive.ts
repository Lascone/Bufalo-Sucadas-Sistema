import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getCentralPrisma } from './central-db';
import { readCentralConnection, writeCentralConnection } from './central-connection';
import { readSyncAuth, writeSyncAuth } from './sync-auth';

export type WipeArchiveRow = {
  id: string;
  companyId: string;
  archivedDeviceId: string;
  archivedName: string;
  fromAt: string;
  toAt: string;
  note: string | null;
  createdAt: string;
};

export type ArchiveEntityRow = {
  id: string;
  companyId: string;
  deviceId: string | null;
  entityType: string;
  version: number;
  payload: Record<string, unknown>;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServerHistoryGroup = {
  deviceId: string;
  deviceName: string;
  fromAt: string;
  toAt: string;
  entityCount: number;
  hasWipeArchive: boolean;
  wipeArchiveId: string | null;
};

const ARCHIVE_ENTITY_TYPES = [
  'CashRegister',
  'CashRegisterMovement',
  'Sale',
  'SaleComment',
  'Purchase',
  'PatioMovement',
  'FinanceDay',
  'CashLoan',
  'Material',
  'Contact',
] as const;

async function ensureWipeArchivesTable(): Promise<boolean> {
  const db = await getCentralPrisma();
  if (!db) return false;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "wipe_archives" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "archivedDeviceId" TEXT NOT NULL,
      "archivedName" TEXT NOT NULL,
      "fromAt" TIMESTAMP(3) NOT NULL,
      "toAt" TIMESTAMP(3) NOT NULL,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "wipe_archives_pkey" PRIMARY KEY ("id")
    )
  `);
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "wipe_archives_companyId_toAt_idx"
    ON "wipe_archives"("companyId", "toAt")
  `);
  return true;
}

function nextArchivedName(base: string, taken: Set<string>): string {
  const clean = base.trim() || 'Escritório';
  for (let i = 1; i <= 99; i++) {
    const candidate = `${clean}_${String(i).padStart(2, '0')}`;
    if (![...taken].some((t) => t.toLowerCase() === candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${clean}_${Date.now()}`;
}

/**
 * Arquiva época no PG, renomeia device antigo e gera novo deviceId local.
 * Chamar ANTES do wipeLocalData.
 */
export async function archiveAndRotateDeviceOnWipe(input?: {
  note?: string;
}): Promise<
  | {
      ok: true;
      archive: WipeArchiveRow;
      archivedName: string;
      newDeviceId: string;
      offline?: false;
    }
  | { ok: true; offline: true; message: string }
  | { ok: false; error: string }
> {
  const auth = readSyncAuth();
  const cfg = readCentralConnection();
  const cleanName = (cfg.deviceName || auth.deviceName || 'Escritório').trim();

  let db;
  try {
    db = await getCentralPrisma();
  } catch (e) {
    return {
      ok: true,
      offline: true,
      message:
        e instanceof Error
          ? e.message
          : 'PostgreSQL indisponível — wipe só local; histórico fica no servidor.',
    };
  }
  if (!db || !auth.companyId || !auth.deviceId) {
    return {
      ok: true,
      offline: true,
      message:
        'Sem conexão central — wipe só local. Conecte o banco depois para ver Dados antigos.',
    };
  }

  try {
    await ensureWipeArchivesTable();

    const companyId = auth.companyId;
    const oldDeviceId = auth.deviceId;
    const toAt = new Date();

    const bounds = await db.$queryRawUnsafe<
      Array<{ minAt: Date | null; maxAt: Date | null; cnt: bigint }>
    >(
      `SELECT MIN("createdAt") AS "minAt", MAX("updatedAt") AS "maxAt", COUNT(*)::bigint AS cnt
       FROM "sync_entities"
       WHERE "companyId" = $1 AND "deviceId" = $2 AND "deletedAt" IS NULL`,
      companyId,
      oldDeviceId,
    );
    const row = bounds[0];
    const fromAt = row?.minAt ? new Date(row.minAt) : toAt;

    const devices = await db.device.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, friendlyName: true },
    });
    const taken = new Set(devices.map((d) => d.friendlyName));
    const archivedName = nextArchivedName(cleanName, taken);

    const oldDevice = devices.find((d) => d.id === oldDeviceId);
    if (oldDevice) {
      await db.device.update({
        where: { id: oldDeviceId },
        data: { friendlyName: archivedName },
      });
    }

    const archiveId = randomUUID();
    await db.$executeRawUnsafe(
      `INSERT INTO "wipe_archives"
        ("id","companyId","archivedDeviceId","archivedName","fromAt","toAt","note","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      archiveId,
      companyId,
      oldDeviceId,
      archivedName,
      fromAt,
      toAt,
      input?.note?.trim() ||
        `Fechamento de wipe — ${fromAt.toLocaleDateString('pt-BR')} até ${toAt.toLocaleDateString('pt-BR')}`,
    );

    const newDeviceId = randomUUID();
    const secret = randomBytes(32).toString('hex');
    const deviceSecretHash = createHash('sha256').update(secret).digest('hex');

    await db.device.create({
      data: {
        id: newDeviceId,
        companyId,
        branchId: auth.branchId,
        friendlyName: cleanName,
        deviceSecretHash,
        createdByUserId: auth.userId,
        lastSeenAt: new Date(),
        syncStatus: 'SYNCED',
      },
    });

    writeCentralConnection({ ...cfg, deviceName: cleanName });
    writeSyncAuth({
      ...auth,
      deviceId: newDeviceId,
      deviceName: cleanName,
      connectedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      archive: {
        id: archiveId,
        companyId,
        archivedDeviceId: oldDeviceId,
        archivedName,
        fromAt: fromAt.toISOString(),
        toAt: toAt.toISOString(),
        note:
          input?.note?.trim() ||
          `Fechamento de wipe — ${fromAt.toLocaleDateString('pt-BR')} até ${toAt.toLocaleDateString('pt-BR')}`,
        createdAt: new Date().toISOString(),
      },
      archivedName,
      newDeviceId,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function listWipeArchives(): Promise<
  { ok: true; archives: WipeArchiveRow[] } | { ok: false; error: string }
> {
  try {
    const db = await getCentralPrisma();
    const auth = readSyncAuth();
    if (!db || !auth.companyId) {
      return { ok: false, error: 'PostgreSQL não configurado ou sem empresa.' };
    }
    await ensureWipeArchivesTable();
    const rows = await db.$queryRawUnsafe<
      Array<{
        id: string;
        companyId: string;
        archivedDeviceId: string;
        archivedName: string;
        fromAt: Date;
        toAt: Date;
        note: string | null;
        createdAt: Date;
      }>
    >(
      `SELECT * FROM "wipe_archives"
       WHERE "companyId" = $1
       ORDER BY "toAt" DESC
       LIMIT 100`,
      auth.companyId,
    );
    return {
      ok: true,
      archives: rows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        archivedDeviceId: r.archivedDeviceId,
        archivedName: r.archivedName,
        fromAt: new Date(r.fromAt).toISOString(),
        toAt: new Date(r.toAt).toISOString(),
        note: r.note,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function queryArchiveEntities(input: {
  archiveId?: string;
  deviceId?: string;
  from?: string;
  to?: string;
  entityTypes?: string[];
  limit?: number;
}): Promise<
  { ok: true; entities: ArchiveEntityRow[] } | { ok: false; error: string }
> {
  try {
    const db = await getCentralPrisma();
    const auth = readSyncAuth();
    if (!db || !auth.companyId) {
      return { ok: false, error: 'PostgreSQL não configurado ou sem empresa.' };
    }
    await ensureWipeArchivesTable();

    let deviceId = input.deviceId ?? null;
    let from = input.from ? new Date(input.from) : null;
    let to = input.to ? new Date(input.to) : null;

    if (input.archiveId) {
      const archives = await db.$queryRawUnsafe<
        Array<{
          archivedDeviceId: string;
          fromAt: Date;
          toAt: Date;
        }>
      >(
        `SELECT "archivedDeviceId","fromAt","toAt" FROM "wipe_archives"
         WHERE "id" = $1 AND "companyId" = $2 LIMIT 1`,
        input.archiveId,
        auth.companyId,
      );
      const a = archives[0];
      if (!a) return { ok: false, error: 'Arquivo de wipe não encontrado.' };
      deviceId = a.archivedDeviceId;
      from = from ?? new Date(a.fromAt);
      to = to ?? new Date(a.toAt);
    }

    const types =
      input.entityTypes?.length
        ? input.entityTypes
        : [...ARCHIVE_ENTITY_TYPES];
    const limit = Math.min(Math.max(input.limit ?? 500, 1), 2000);

    const params: unknown[] = [auth.companyId];
    let sql = `SELECT "id","companyId","deviceId","entityType","version","payload","deletedAt","createdAt","updatedAt"
      FROM "sync_entities"
      WHERE "companyId" = $1 AND "deletedAt" IS NULL`;

    if (deviceId) {
      params.push(deviceId);
      sql += ` AND "deviceId" = $${params.length}`;
    }
    if (from) {
      params.push(from);
      sql += ` AND "updatedAt" >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND "createdAt" <= $${params.length}`;
    }
    if (types.length) {
      params.push(types);
      sql += ` AND "entityType" = ANY($${params.length}::text[])`;
    }
    params.push(limit);
    sql += ` ORDER BY "updatedAt" DESC LIMIT $${params.length}`;

    const rows = await db.$queryRawUnsafe<
      Array<{
        id: string;
        companyId: string;
        deviceId: string | null;
        entityType: string;
        version: number;
        payload: unknown;
        deletedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(sql, ...params);

    return {
      ok: true,
      entities: rows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        deviceId: r.deviceId,
        entityType: r.entityType,
        version: r.version,
        payload:
          r.payload && typeof r.payload === 'object'
            ? (r.payload as Record<string, unknown>)
            : {},
        deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Agrupa sync_entities por device — inclui histórico pré-wipe sem WipeArchive. */
export async function listServerHistoryGroups(): Promise<
  { ok: true; groups: ServerHistoryGroup[] } | { ok: false; error: string }
> {
  try {
    const db = await getCentralPrisma();
    const auth = readSyncAuth();
    if (!db || !auth.companyId) {
      return { ok: false, error: 'PostgreSQL não configurado ou sem empresa.' };
    }
    await ensureWipeArchivesTable();

    const groups = await db.$queryRawUnsafe<
      Array<{
        deviceId: string;
        minAt: Date;
        maxAt: Date;
        cnt: bigint;
      }>
    >(
      `SELECT "deviceId",
              MIN("createdAt") AS "minAt",
              MAX("updatedAt") AS "maxAt",
              COUNT(*)::bigint AS cnt
       FROM "sync_entities"
       WHERE "companyId" = $1
         AND "deviceId" IS NOT NULL
         AND "deletedAt" IS NULL
         AND "entityType" = ANY($2::text[])
       GROUP BY "deviceId"
       ORDER BY MAX("updatedAt") DESC`,
      auth.companyId,
      [...ARCHIVE_ENTITY_TYPES],
    );

    const devices = await db.device.findMany({
      where: { companyId: auth.companyId },
      select: { id: true, friendlyName: true },
    });
    const nameById = new Map(devices.map((d) => [d.id, d.friendlyName]));

    const archives = await listWipeArchives();
    const archiveByDevice = new Map<string, WipeArchiveRow>();
    if (archives.ok) {
      for (const a of archives.archives) {
        if (!archiveByDevice.has(a.archivedDeviceId)) {
          archiveByDevice.set(a.archivedDeviceId, a);
        }
      }
    }

    return {
      ok: true,
      groups: groups.map((g) => {
        const archive = archiveByDevice.get(g.deviceId);
        return {
          deviceId: g.deviceId,
          deviceName:
            archive?.archivedName ||
            nameById.get(g.deviceId) ||
            g.deviceId.slice(0, 8),
          fromAt: new Date(g.minAt).toISOString(),
          toAt: new Date(g.maxAt).toISOString(),
          entityCount: Number(g.cnt),
          hasWipeArchive: !!archive,
          wipeArchiveId: archive?.id ?? null,
        };
      }),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function registerRetroactiveWipeArchive(input: {
  deviceId: string;
  fromAt: string;
  toAt: string;
  note?: string;
}): Promise<
  { ok: true; archive: WipeArchiveRow } | { ok: false; error: string }
> {
  try {
    const db = await getCentralPrisma();
    const auth = readSyncAuth();
    if (!db || !auth.companyId) {
      return { ok: false, error: 'PostgreSQL não configurado.' };
    }
    await ensureWipeArchivesTable();

    const device = await db.device.findFirst({
      where: { id: input.deviceId, companyId: auth.companyId },
    });
    const archivedName = device?.friendlyName || input.deviceId.slice(0, 8);
    const id = randomUUID();
    const fromAt = new Date(input.fromAt);
    const toAt = new Date(input.toAt);
    const note =
      input.note?.trim() ||
      `Fechamento de wipe (retroativo) — ${fromAt.toLocaleDateString('pt-BR')} até ${toAt.toLocaleDateString('pt-BR')}`;

    await db.$executeRawUnsafe(
      `INSERT INTO "wipe_archives"
        ("id","companyId","archivedDeviceId","archivedName","fromAt","toAt","note","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      id,
      auth.companyId,
      input.deviceId,
      archivedName,
      fromAt,
      toAt,
      note,
    );

    return {
      ok: true,
      archive: {
        id,
        companyId: auth.companyId,
        archivedDeviceId: input.deviceId,
        archivedName,
        fromAt: fromAt.toISOString(),
        toAt: toAt.toISOString(),
        note,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export { ARCHIVE_ENTITY_TYPES };
