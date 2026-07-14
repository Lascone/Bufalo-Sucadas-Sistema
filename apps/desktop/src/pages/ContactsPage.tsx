import { PageHeader, PlaceholderCard } from '../components/Page';

export function ContactsPage() {
  return (
    <div>
      <PageHeader
        title="Contatos"
        subtitle="Cadastro unificado: clientes, fornecedores, empresas compradoras, transportadoras e parceiros."
      />
      <PlaceholderCard>
        <p>Pesquisa por nome, CPF, CNPJ, telefone, WhatsApp, cidade e nome fantasia.</p>
        <p className="mt-2 text-sm text-steel-400">
          Módulo completo na próxima entrega (estrutura Prisma pronta).
        </p>
      </PlaceholderCard>
    </div>
  );
}
