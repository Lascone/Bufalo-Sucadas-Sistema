import { PageHeader, PlaceholderCard } from '../components/Page';

export function PatioPage() {
  return (
    <div>
      <PageHeader
        title="Pátio"
        subtitle="Referência do que há no ferro-velho. Por enquanto só informativo — sem controle obrigatório de saldo nesta versão."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Como funciona</p>
          <p className="mt-2 text-ink-100">
            Compra = material chega. Venda = material sai. O saldo do pátio será a
            soma dessas movimentações quando o controle for ativado.
          </p>
        </PlaceholderCard>
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Hoje</p>
          <p className="mt-2 text-ink-100">
            Use Materiais, Compras e Vendas normalmente. O pátio não trava venda por
            falta de saldo.
          </p>
        </PlaceholderCard>
        <PlaceholderCard>
          <p className="text-sm text-ink-300">Em breve</p>
          <p className="mt-2 text-ink-100">
            Visão por material (cobre, ferro, alumínio…), peso disponível e valor
            estimado — alimentada pelas compras e vendas.
          </p>
        </PlaceholderCard>
      </div>
    </div>
  );
}
