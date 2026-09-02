/** Bridge renderer → Electron sync-auth (sem JWT). */

export async function readSyncAuth(): Promise<{
  configured: boolean;
  pgHost: string;
  pgDatabase: string;
  deviceId: string;
  companyId: string | null;
} | null> {
  if (!window.ferrogestor?.getSyncAuthStatus) return null;
  const status = await window.ferrogestor.getSyncAuthStatus();
  return {
    configured: status.configured,
    pgHost: status.pgHost,
    pgDatabase: status.pgDatabase,
    deviceId: status.deviceId,
    companyId: status.companyId,
  };
}
