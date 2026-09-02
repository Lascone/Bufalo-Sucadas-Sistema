import { PrismaClient, Prisma } from '../prisma/generated/central/index.js';
import { centralDatabaseUrl } from '@ferrogestor/shared';

export type CentralPrismaClient = PrismaClient;
export { PrismaClient as CentralPrismaClientClass, Prisma };

export function createCentralPrisma(url?: string): PrismaClient {
  let resolved = url ?? process.env.DATABASE_URL;
  if (!resolved) {
    try {
      resolved = centralDatabaseUrl();
    } catch {
      resolved = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
    }
  }
  return new PrismaClient({ datasources: { db: { url: resolved } } });
}
