import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import type { CentralPrismaClient, SyncCore } from '@ferrogestor/database';
import { getConfiguredDatabaseUrl, readCentralConnection } from './central-connection';

let client: CentralPrismaClient | null = null;
let clientUrl: string | null = null;

type DatabaseModule = {
  createCentralPrisma: (typeof import('@ferrogestor/database'))['createCentralPrisma'];
  createSyncCore: (typeof import('@ferrogestor/database'))['createSyncCore'];
};

/**
 * Em produção o pacote Prisma fica em resources/central-db (fora do ASAR).
 * Carrega só central + sync-core (evita o client SQLite local).
 */
async function loadDatabase(): Promise<DatabaseModule> {
  if (app.isPackaged) {
    const dist = path.join(process.resourcesPath, 'central-db', 'dist');
    const central = (await import(
      pathToFileURL(path.join(dist, 'central.js')).href
    )) as DatabaseModule;
    const syncCore = (await import(
      pathToFileURL(path.join(dist, 'sync-core.js')).href
    )) as DatabaseModule;
    return {
      createCentralPrisma: central.createCentralPrisma,
      createSyncCore: syncCore.createSyncCore,
    };
  }
  return import('@ferrogestor/database');
}

export async function getCentralPrisma(): Promise<CentralPrismaClient | null> {
  const url = getConfiguredDatabaseUrl();
  if (!url) {
    await disconnectCentralPrisma();
    return null;
  }
  if (client && clientUrl === url) return client;

  await disconnectCentralPrisma();
  const { createCentralPrisma } = await loadDatabase();
  client = createCentralPrisma(url);
  clientUrl = url;
  try {
    await client.$connect();
    await client.$queryRaw`SELECT 1`;
    return client;
  } catch (err) {
    await disconnectCentralPrisma();
    throw err;
  }
}

export async function disconnectCentralPrisma(): Promise<void> {
  if (client) {
    try {
      await client.$disconnect();
    } catch {
      // ignore
    }
  }
  client = null;
  clientUrl = null;
}

export async function getSyncCore(): Promise<SyncCore | null> {
  const db = await getCentralPrisma();
  if (!db) return null;
  const { createSyncCore } = await loadDatabase();
  return createSyncCore(db);
}

export type CentralIdentity = {
  companyId: string;
  branchId: string | null;
  userId: string;
  deviceId: string;
  deviceName: string;
  companyName: string;
  username: string;
};

/**
 * Resolve empresa/usuário no Postgres e registra/atualiza este PC como Device.
 * Sem JWT — identidade fica no sync-auth.json local.
 */
export async function connectCentralIdentity(input: {
  deviceId: string;
  deviceName: string;
}): Promise<
  { ok: true; identity: CentralIdentity } | { ok: false; error: string }
> {
  let db: CentralPrismaClient;
  try {
    const connected = await getCentralPrisma();
    if (!connected) {
      return {
        ok: false,
        error: 'Configure o PostgreSQL em Configurações → Banco online.',
      };
    }
    db = connected;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const company = await db.company.findFirst({
      where: { active: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!company) {
      return {
        ok: false,
        error: 'Nenhuma empresa no banco. Rode o seed no PostgreSQL central.',
      };
    }

    const branch =
      (await db.branch.findFirst({
        where: { companyId: company.id, active: true, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      })) ?? null;

    const user = await db.user.findFirst({
      where: { companyId: company.id, active: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) {
      return {
        ok: false,
        error: 'Nenhum usuário ativo no banco. Rode o seed no PostgreSQL central.',
      };
    }

    const cfg = readCentralConnection();
    const deviceName =
      input.deviceName.trim() || cfg.deviceName?.trim() || 'Escritório';

    let device = await db.device.findFirst({
      where: {
        companyId: company.id,
        OR: [{ id: input.deviceId }, { friendlyName: deviceName }],
        deletedAt: null,
      },
    });

    if (device?.blocked) {
      return {
        ok: false,
        error: device.blockedReason ?? 'Este dispositivo está bloqueado no servidor.',
      };
    }

    if (!device) {
      const secret = randomBytes(32).toString('hex');
      const deviceSecretHash = createHash('sha256').update(secret).digest('hex');
      device = await db.device.create({
        data: {
          id: input.deviceId,
          companyId: company.id,
          branchId: branch?.id ?? null,
          friendlyName: deviceName,
          deviceSecretHash,
          createdByUserId: user.id,
          lastSeenAt: new Date(),
          syncStatus: 'SYNCED',
        },
      });
    } else {
      device = await db.device.update({
        where: { id: device.id },
        data: {
          friendlyName: deviceName,
          lastSeenAt: new Date(),
          branchId: device.branchId ?? branch?.id ?? null,
        },
      });
    }

    return {
      ok: true,
      identity: {
        companyId: company.id,
        branchId: device.branchId ?? branch?.id ?? null,
        userId: user.id,
        deviceId: device.id,
        deviceName: device.friendlyName,
        companyName: company.tradeName ?? company.legalName,
        username: user.username,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
