import { useAppStore } from '../stores/app-store';

export function StatusFooter() {
  const appInfo = useAppStore((s) => s.appInfo);
  const sync = useAppStore((s) => s.sync);
  const session = useAppStore((s) => s.session);

  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-steel-400/30 bg-white/70 px-4 py-2 text-xs text-steel-700 backdrop-blur dark:bg-steel-900/80 dark:text-steel-100">
      <span>Usuário: {session.username}</span>
      <span>Filial: {session.branchName}</span>
      <span>Dispositivo: {session.deviceName}</span>
      <span>
        Conexão:{' '}
        {sync.online === null ? '—' : sync.online ? 'Online' : 'Offline'}
      </span>
      <span>Pendentes: {sync.pendingCount}</span>
      <span className="ml-auto">v{appInfo?.version ?? '0.1.0'}</span>
    </footer>
  );
}
