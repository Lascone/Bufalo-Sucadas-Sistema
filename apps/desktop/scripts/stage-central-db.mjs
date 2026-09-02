/**
 * Copia Prisma central + deps runtime para staging local do electron-builder.
 * Evita junctions do pnpm e garante que `zod` vá no instalador.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.join(__dirname, '..');
const repoRoot = path.join(desktopRoot, '../..');
const staging = path.join(desktopRoot, 'staging', 'central-db');
const requireFromShared = createRequire(
  path.join(repoRoot, 'packages/shared/package.json'),
);

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(from, to, { skipSrc = false } = {}) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      if (base.endsWith('.tmp') || base.includes('.tmp')) return false;
      if (skipSrc && (base === 'src' || base === 'README.md' || base === 'LICENSE')) {
        return false;
      }
      return true;
    },
  });
}

rmrf(staging);
fs.mkdirSync(staging, { recursive: true });

copyDir(
  path.join(repoRoot, 'packages/database/dist'),
  path.join(staging, 'dist'),
);
copyDir(
  path.join(repoRoot, 'packages/database/prisma/generated/central'),
  path.join(staging, 'prisma/generated/central'),
);
fs.copyFileSync(
  path.join(repoRoot, 'packages/database/package.json'),
  path.join(staging, 'package.json'),
);

const sharedDest = path.join(staging, 'node_modules/@ferrogestor/shared');
copyDir(path.join(repoRoot, 'packages/shared/dist'), path.join(sharedDest, 'dist'));
fs.copyFileSync(
  path.join(repoRoot, 'packages/shared/package.json'),
  path.join(sharedDest, 'package.json'),
);

const zodEntry = requireFromShared.resolve('zod/package.json');
const zodRoot = path.dirname(zodEntry);
copyDir(zodRoot, path.join(staging, 'node_modules/zod'), { skipSrc: true });

console.log('[stage-central-db] pronto em', staging);
console.log('[stage-central-db] zod =', zodRoot);
