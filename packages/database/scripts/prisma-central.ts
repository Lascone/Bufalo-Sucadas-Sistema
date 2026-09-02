import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCentralDatabaseUrl } from '../src/ensure-central-env.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
ensureCentralDatabaseUrl();

const prismaArgs = process.argv.slice(2);
const schemaRel = 'prisma/central/schema.prisma';

const result = spawnSync('npx', ['prisma', ...prismaArgs, '--schema', schemaRel], {
  stdio: 'inherit',
  shell: true,
  cwd: root,
  env: process.env,
});

process.exit(result.status ?? 1);
