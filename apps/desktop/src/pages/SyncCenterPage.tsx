import { PageHeader, PlaceholderCard } from '../components/Page';
import { useAppStore } from '../stores/app-store';

export function SyncCenterPage() {
  const sync = useAppStore((s) => s.sync);
  const runSyncNow = useAppStore((s) => s.runSyncNow);
  const refreshSync = useAppStore((s) => s.refreshSync);

  const exportDiag = () => {
    const blob = new Blob([JSON.stringify(sync, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ferrogestor-sync-diag-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Conexão com o banco"
        subtitle="Envio automático em tempo real para PostgreSQL. A fila local reenvia quando a internet voltar."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refreshSync()}
              className="rounded-md border border-white/15 px-4 py-2 text-sm text-ink-100 hover:border-brand-400/40"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void runSyncNow()}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-400"
            >
              Sincronizar agora
            </button>
            <button
              type="button"
              onClick={exportDiag}
              className="rounded-md border border-white/15 px-4 py-2 text-sm text-ink-100 hover:border-brand-400/40"
            >
              Exportar diagnóstico
            </button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Conexão</p>
          <p className="mt-1 text-xl font-semibold">
            {sync.online === null ? 'Desconhecido' : sync.online ? 'Online' : 'Offline'}
          </p>
        </PlaceholderCard>
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Última sincronização</p>
          <p className="mt-1 text-sm">
            {sync.lastSyncAt
              ? new Date(sync.lastSyncAt).toLocaleString('pt-BR')
              : 'Nunca'}
          </p>
        </PlaceholderCard>
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Pendentes</p>
          <p className="mt-1 text-xl font-semibold">{sync.pendingCount}</p>
        </PlaceholderCard>
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Erros / Conflitos</p>
          <p className="mt-1 text-xl font-semibold">
            {sync.errorCount} / {sync.conflictCount}
          </p>
        </PlaceholderCard>
      </div>

      {sync.lastError && (
        <div className="mt-4 rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {sync.lastError}
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 font-display text-2xl">Histórico recente</h2>
        <PlaceholderCard>
          {sync.history.length === 0 ? (
            <p className="text-sm text-ink-300">Nenhuma sincronização registrada ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {sync.history.map((h) => (
                <li key={h.at} className="flex flex-wrap gap-3 border-b border-white/10 py-2">
                  <span>{new Date(h.at).toLocaleString('pt-BR')}</span>
                  <span>push {h.pushed}</span>
                  <span>pull {h.pulled}</span>
                  <span>conflitos {h.conflicts}</span>
                  <span>erros {h.errors}</span>
                  <span>{h.success ? 'OK' : 'Falha'}</span>
                </li>
              ))}
            </ul>
          )}
        </PlaceholderCard>
      </div>
    </div>
  );
}
