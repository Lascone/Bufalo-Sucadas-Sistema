import { PageHeader, PlaceholderCard } from '../components/Page';
import { useAppStore } from '../stores/app-store';

export function SettingsPage() {
  const appInfo = useAppStore((s) => s.appInfo);

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Dispositivo, backups, atualizações e preferências locais."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderCard>
          <h3 className="font-semibold">Aplicativo</h3>
          <p className="mt-2 text-sm">Nome: {appInfo?.name}</p>
          <p className="text-sm">Empresa: {appInfo?.company}</p>
          <p className="text-sm">Versão: {appInfo?.version}</p>
          <p className="text-sm break-all">SQLite: {appInfo?.dbPath ?? '—'}</p>
        </PlaceholderCard>
        <PlaceholderCard>
          <h3 className="font-semibold">Atualização automática</h3>
          <p className="mt-2 text-sm">
            Releases publicadas via tag Git (`vX.Y.Z`) no GitHub Actions. O app valida o
            update, faz backup do banco e aplica a nova versão.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-brand-500 px-3 py-2 text-sm text-white"
              onClick={() => void window.ferrogestor?.checkForUpdates()}
            >
              Verificar atualizações
            </button>
            <button
              type="button"
              className="rounded-md border border-steel-400/40 px-3 py-2 text-sm"
              onClick={() => void window.ferrogestor?.createBackup('manual')}
            >
              Backup manual
            </button>
          </div>
        </PlaceholderCard>
      </div>
    </div>
  );
}
