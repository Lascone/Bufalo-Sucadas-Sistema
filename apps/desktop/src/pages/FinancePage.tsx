import { PageHeader, PlaceholderCard } from '../components/Page';

export function FinancePage() {
  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Contas a pagar/receber, caixa, depósitos e fluxo — sem exclusão de lançamentos finalizados."
      />
      <PlaceholderCard>
        Cancelamentos geram estorno. Valores monetários usam Decimal.
      </PlaceholderCard>
    </div>
  );
}
