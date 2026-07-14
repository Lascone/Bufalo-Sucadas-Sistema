import { PageHeader, PlaceholderCard } from '../components/Page';

export function MaterialsPage() {
  return (
    <div>
      <PageHeader
        title="Materiais"
        subtitle="Ferro, cobre, alumínio e variações de qualidade com preços padrão de compra/venda."
      />
      <PlaceholderCard>
        Seed inicial inclui materiais típicos de ferro-velho (ex.: Cobre limpo, Ferro pesado).
      </PlaceholderCard>
    </div>
  );
}
