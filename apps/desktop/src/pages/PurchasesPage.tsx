import { PageHeader, PlaceholderCard } from '../components/Page';

export function PurchasesPage() {
  return (
    <div>
      <PageHeader
        title="Compras"
        subtitle="Registro rápido de compra com pesagem, múltiplos itens e cálculo automático do líquido."
      />
      <PlaceholderCard>
        Fluxo previsto: rascunho → pesagem → pagamento → finalizada (entrada de estoque + financeiro + sync).
      </PlaceholderCard>
    </div>
  );
}
