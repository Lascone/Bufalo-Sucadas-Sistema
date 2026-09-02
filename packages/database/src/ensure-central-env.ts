import { centralDatabaseUrl } from '@ferrogestor/shared';

/** Garante DATABASE_URL para Prisma CLI e seed. */
export function ensureCentralDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }
  try {
    const url = centralDatabaseUrl();
    process.env.DATABASE_URL = url;
    return url;
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? e.message
        : 'DATABASE_URL não definido. Configure em Configurações → Banco online ou exporte DATABASE_URL.',
    );
  }
}
