/** Configuração do Postgres central — sem senha/usuário hardcoded. */

export type CentralPgConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export type CentralConnectionConfig = CentralPgConfig & {
  /** Nome amigável deste PC (dispositivo). */
  deviceName?: string;
};

export const EMPTY_CENTRAL_CONNECTION: CentralConnectionConfig = {
  host: '',
  port: 5432,
  database: 'bufalo_gestor',
  user: '',
  password: '',
  deviceName: 'Escritório',
};

export function buildDatabaseUrl(
  cfg: Pick<CentralPgConfig, 'host' | 'port' | 'database' | 'user' | 'password'>,
): string {
  const host = cfg.host.trim();
  if (!host || !cfg.user.trim()) {
    throw new Error(
      'Configure host e usuário do PostgreSQL em Configurações → Banco online.',
    );
  }
  const enc = encodeURIComponent(cfg.password);
  return `postgresql://${cfg.user}:${enc}@${host}:${cfg.port}/${cfg.database || 'bufalo_gestor'}?schema=public`;
}

/** URL Prisma: env DATABASE_URL ou erro se incompleto. */
export function centralDatabaseUrl(cfg?: Partial<CentralPgConfig>): string {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  return buildDatabaseUrl({ ...EMPTY_CENTRAL_CONNECTION, ...cfg });
}

export function isCentralConfigured(cfg: Partial<CentralConnectionConfig>): boolean {
  return Boolean(cfg.host?.trim() && cfg.user?.trim() && cfg.password != null);
}
