import { PageHeader, PlaceholderCard } from '../components/Page';

export function ConflictsPage() {
  return (
    <div>
      <PageHeader
        title="Resolução de conflitos"
        subtitle="Compare valor local e do servidor, escolha a versão e registre a justificativa."
      />
      <PlaceholderCard>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Manter versão local</li>
          <li>Manter versão do servidor</li>
          <li>Mesclar informações</li>
          <li>Justificativa obrigatória</li>
        </ul>
        <p className="mt-3 text-sm text-ink-300">
          Endpoint: POST /api/v1/sync/conflicts/:id/resolve
        </p>
      </PlaceholderCard>
    </div>
  );
}
