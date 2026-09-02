import { useAppStore } from '../stores/app-store';

export function StatusFooter() {
  const appInfo = useAppStore((s) => s.appInfo);
  const sync = useAppStore((s) => s.sync);
  const session = useAppStore((s) => s.session);

  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 bg-ink-950/90 px-4 py-2.5 text-xs text-ink-200 backdrop-blur">
      <span>
        Usuário: <strong className="text-ink-50">{session.username}</strong>
      </span>
      <span>Filial: {session.branchName}</span>
      <span>Dispositivo: {session.deviceName}</span>
      <span
        className={
          sync.online ? 'text-moss-400' : sync.online === false ? 'text-brand-400' : ''
        }
      >
        {sync.online === null
          ? 'Conexão: —'
          : sync.online
            ? sync.pendingCount > 0
              ? `Enviando… ${sync.pendingCount} na fila`
              : 'Conectado ao banco'
            : `Offline — ${sync.pendingCount} na fila`}
      </span>
      <span className="ml-auto text-ink-300">v{appInfo?.version ?? '0.1.0'}</span>
    </footer>
  );
}
