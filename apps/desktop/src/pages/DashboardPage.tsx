import { PageHeader, PlaceholderCard } from '../components/Page';
import { useAppStore } from '../stores/app-store';

export function DashboardPage() {
  const sync = useAppStore((s) => s.sync);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Visão rápida da operação Bufalo Sucatas — compras, vendas, estoque e sincronização."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Compras hoje', '—'],
          ['Vendas hoje', '—'],
          ['Estoque (peso)', '—'],
          ['Pendências sync', String(sync.pendingCount)],
        ].map(([label, value]) => (
          <PlaceholderCard key={label}>
            <p className="text-sm text-steel-400">{label}</p>
            <p className="mt-2 font-display text-3xl text-brand-700 dark:text-brand-100">
              {value}
            </p>
          </PlaceholderCard>
        ))}
      </div>
      <div className="mt-4">
        <PlaceholderCard>
          <p className="text-sm text-steel-700 dark:text-steel-100/80">
            Métricas de lucro, ranking de materiais e gráficos serão habilitados nos
            módulos de Compras/Vendas. A fundação já expõe o contador de sync.
          </p>
        </PlaceholderCard>
      </div>
    </div>
  );
}
