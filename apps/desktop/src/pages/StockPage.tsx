import { PageHeader, PlaceholderCard } from '../components/Page';

export function StockPage() {
  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Saldo calculado por movimentações — nunca por campo editável isolado."
      />
      <PlaceholderCard>
        Tipos: compra, venda, transferência, perda, inventário, processamento/separação.
      </PlaceholderCard>
    </div>
  );
}
