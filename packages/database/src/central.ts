import { PrismaClient } from '../prisma/generated/central/index.js';

export type CentralPrismaClient = PrismaClient;
export { PrismaClient as CentralPrismaClientClass };

export function createCentralPrisma(url?: string): PrismaClient {
  return new PrismaClient(
    url
      ? { datasources: { db: { url } } }
      : undefined,
  );
}
