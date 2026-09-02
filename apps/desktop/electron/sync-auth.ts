import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readCentralConnection, writeCentralConnection } from './central-connection';
import { connectCentralIdentity, disconnectCentralPrisma } from './central-db';
import { getDataDir } from './local-db';

export type SyncAuthFile = {
  deviceId: string;
  companyId: string | null;
  branchId: string | null;
  userId: string | null;
  deviceName: string;
  username: string;
  companyName: string | null;
  connectedAt: string | null;
};

function authPath(): string {
  return path.join(getDataDir(), 'sync-auth.json');
}

function defaultAuth(): SyncAuthFile {
  const c = readCentralConnection();
  return {
    deviceId: randomUUID(),
    companyId: null,
    branchId: null,
    userId: null,
    deviceName: c.deviceName?.trim() || 'Escritório',
    username: '',
    companyName: null,
    connectedAt: null,
  };
}

export function readSyncAuth(): SyncAuthFile {
  const p = authPath();
  const base = defaultAuth();
  if (!fs.existsSync(p)) {
    writeSyncAuth(base);
    return base;
  }
  const stored = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<SyncAuthFile> & {
    accessToken?: string | null;
    apiBase?: string;
  };
  return {
    ...base,
    ...stored,
    deviceId: stored.deviceId || base.deviceId,
    deviceName: stored.deviceName || base.deviceName,
  };
}

export function writeSyncAuth(auth: SyncAuthFile): void {
  fs.writeFileSync(authPath(), JSON.stringify(auth, null, 2), 'utf8');
}

export function getSyncAuthStatus() {
  const a = readSyncAuth();
  const c = readCentralConnection();
  return {
    configured: Boolean(a.companyId && a.userId && a.deviceId && c.host && c.user),
    username: a.username,
    deviceId: a.deviceId,
    deviceName: a.deviceName,
    companyId: a.companyId,
    companyName: a.companyName,
    connectedAt: a.connectedAt,
    pgHost: c.host,
    pgDatabase: c.database,
  };
}

/** Conecta ao Postgres configurado e registra este PC. */
export async function connectCentral(input?: {
  deviceName?: string;
}): Promise<{ ok: true; status: ReturnType<typeof getSyncAuthStatus> } | { ok: false; error: string }> {
  const auth = readSyncAuth();
  if (input?.deviceName?.trim()) {
    auth.deviceName = input.deviceName.trim();
    const c = readCentralConnection();
    writeCentralConnection({ ...c, deviceName: auth.deviceName });
  }

  await disconnectCentralPrisma();
  const result = await connectCentralIdentity({
    deviceId: auth.deviceId,
    deviceName: auth.deviceName,
  });
  if (!result.ok) return result;

  auth.companyId = result.identity.companyId;
  auth.branchId = result.identity.branchId;
  auth.userId = result.identity.userId;
  auth.deviceId = result.identity.deviceId;
  auth.deviceName = result.identity.deviceName;
  auth.username = result.identity.username;
  auth.companyName = result.identity.companyName;
  auth.connectedAt = new Date().toISOString();
  writeSyncAuth(auth);
  return { ok: true, status: getSyncAuthStatus() };
}

export function clearSyncSession() {
  const auth = readSyncAuth();
  auth.companyId = null;
  auth.branchId = null;
  auth.userId = null;
  auth.username = '';
  auth.companyName = null;
  auth.connectedAt = null;
  writeSyncAuth(auth);
  void disconnectCentralPrisma();
}

export function getSyncSessionIds() {
  const a = readSyncAuth();
  return {
    companyId: a.companyId,
    branchId: a.branchId,
    deviceId: a.deviceId,
    userId: a.userId,
  };
}

/** Compat: IPC antigo loginSync → connectCentral */
export async function loginToSyncServer(input?: {
  deviceName?: string;
  apiBase?: string;
  username?: string;
  password?: string;
}): Promise<{ ok: true; status: ReturnType<typeof getSyncAuthStatus> } | { ok: false; error: string }> {
  return connectCentral({ deviceName: input?.deviceName });
}
