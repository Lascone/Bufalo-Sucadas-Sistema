import { PageHeader, PlaceholderCard } from '../components/Page';

export function SalesPage() {
  return (
    <div>
      <PageHeader
        title="Vendas"
        subtitle="Vendas para empresas compradoras com tabelas de preço negociadas e créditos."
      />
      <PlaceholderCard>
        Finalização gera baixa de estoque, conta a receber e envio à fila de sincronização.
      </PlaceholderCard>
    </div>
  );
}
