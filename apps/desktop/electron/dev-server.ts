import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';

let child: ChildProcess | null = null;

function monorepoRoot(): string {
  // dist-electron/dev-server.js → apps/desktop → monorepo root
  return path.resolve(__dirname, '../../..');
}

function portOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Sobe a API NestJS local em dev se a porta 3000 estiver livre. */
/**
 * Opcional: sobe a API NestJS em dev.
 * O desktop sincroniza direto com PostgreSQL — este helper não é chamado no fluxo normal.
 */
export async function ensureDevApiServer(): Promise<void> {
  if (process.env.BUFALO_SKIP_DEV_SERVER === '1') return;
  if (await portOpen(3000)) {
    console.log('[dev-server] API já em http://localhost:3000');
    return;
  }

  const root = monorepoRoot();
  const { getConfiguredDatabaseUrl } = await import('./central-connection');
  const databaseUrl = getConfiguredDatabaseUrl();
  console.log('[dev-server] Iniciando API NestJS…');
  child = spawn('npx', ['tsx', 'watch', 'src/main.ts'], {
    cwd: path.join(root, 'apps/server'),
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
    },
  });
  child.on('exit', (code) => {
    console.log('[dev-server] API encerrada', code);
    child = null;
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await portOpen(3000)) {
      console.log('[dev-server] API pronta em http://localhost:3000');
      return;
    }
  }
  console.warn('[dev-server] API não respondeu na porta 3000 (Postgres pode estar recusando login)');
}

export function stopDevApiServer(): void {
  if (child && !child.killed) {
    child.kill();
    child = null;
  }
}
