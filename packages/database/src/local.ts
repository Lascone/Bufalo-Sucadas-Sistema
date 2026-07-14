import { PrismaClient } from '../prisma/generated/local/index.js';

export type LocalPrismaClient = PrismaClient;
export { PrismaClient as LocalPrismaClientClass };

export function createLocalPrisma(url?: string): PrismaClient {
  const databaseUrl = url ?? process.env.LOCAL_DATABASE_URL ?? 'file:./ferrogestor-local.db';
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}
