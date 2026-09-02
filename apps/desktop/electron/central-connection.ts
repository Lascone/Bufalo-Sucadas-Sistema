import fs from 'node:fs';
import path from 'node:path';
import {
  EMPTY_CENTRAL_CONNECTION,
  buildDatabaseUrl,
  isCentralConfigured,
  type CentralConnectionConfig,
} from '@ferrogestor/shared';
import { getDataDir } from './local-db';

function configPath(): string {
  return path.join(getDataDir(), 'central-connection.json');
}

export function readCentralConnection(): CentralConnectionConfig {
  const p = configPath();
  if (!fs.existsSync(p)) {
    return { ...EMPTY_CENTRAL_CONNECTION };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<CentralConnectionConfig> & {
      apiHost?: string;
      apiPort?: number;
      apiUsername?: string;
      apiPassword?: string;
    };
    return {
      ...EMPTY_CENTRAL_CONNECTION,
      host: String(raw.host ?? '').trim(),
      port: Number(raw.port) || 5432,
      database: String(raw.database ?? 'bufalo_gestor').trim() || 'bufalo_gestor',
      user: String(raw.user ?? '').trim(),
      password: String(raw.password ?? ''),
      deviceName: String(raw.deviceName ?? EMPTY_CENTRAL_CONNECTION.deviceName ?? 'Escritório'),
    };
  } catch {
    return { ...EMPTY_CENTRAL_CONNECTION };
  }
}

export function writeCentralConnection(cfg: CentralConnectionConfig): void {
  const next: CentralConnectionConfig = {
    host: String(cfg.host ?? '').trim(),
    port: Number(cfg.port) || 5432,
    database: String(cfg.database ?? 'bufalo_gestor').trim() || 'bufalo_gestor',
    user: String(cfg.user ?? '').trim(),
    password: String(cfg.password ?? ''),
    deviceName: String(cfg.deviceName ?? 'Escritório').trim() || 'Escritório',
  };
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
}

export function getConfiguredDatabaseUrl(): string | null {
  const c = readCentralConnection();
  if (!isCentralConfigured(c)) return null;
  try {
    return buildDatabaseUrl(c);
  } catch {
    return null;
  }
}

export async function testPostgresConnection(
  cfg?: CentralConnectionConfig,
): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const c = cfg ?? readCentralConnection();
  let url: string;
  try {
    url = buildDatabaseUrl(c);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const net = await import('node:net');
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: c.host, port: c.port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.setTimeout(4000, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (!reachable) {
      return {
        ok: false,
        error: `Não alcança ${c.host}:${c.port} — confira IP, firewall e se o Postgres está ligado.`,
      };
    }

    const { Client } = await import('pg');
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });
    await client.connect();
    const r = await client.query<{ ok: number }>('SELECT 1 AS ok');
    await client.end();
    return {
      ok: true,
      detail: `PostgreSQL OK (${c.host}:${c.port}/${c.database}) · SELECT ${r.rows[0]?.ok ?? 1}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
