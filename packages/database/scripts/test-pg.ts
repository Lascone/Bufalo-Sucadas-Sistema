import { buildDatabaseUrl } from '@ferrogestor/shared';

const host = process.env.PGHOST ?? '';
const user = process.env.PGUSER ?? '';
const password = process.env.PGPASSWORD ?? '';
const database = process.env.PGDATABASE ?? 'bufalo_gestor';
const port = Number(process.env.PGPORT ?? 5432);

if (!host || !user) {
  console.error('Defina PGHOST, PGUSER, PGPASSWORD (e opcional PGDATABASE/PGPORT)');
  process.exit(1);
}

const url =
  process.env.DATABASE_URL ??
  buildDatabaseUrl({ host, port, database, user, password });

console.log('Testing:', url.replace(/:([^:@/]+)@/, ':***@'));

const { PrismaClient } = await import('../prisma/generated/central/index.js');
const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const row = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
  console.log('PostgreSQL OK', row);
} catch (e) {
  console.error('PostgreSQL FAIL:', e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
