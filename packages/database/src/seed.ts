import argon2 from 'argon2';
import { createCentralPrisma } from './central.js';
import { ensureCentralDatabaseUrl } from './ensure-central-env.js';

ensureCentralDatabaseUrl();
const prisma = createCentralPrisma();

const SEED_ADMIN_USER = process.env.SEED_ADMIN_USER ?? 'admin';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin';
const SEED_API_BASE =
  process.env.SEED_API_BASE ?? 'http://localhost:3000/api/v1';

const PERMISSIONS = [
  { code: 'VIEW', name: 'Visualizar', module: 'general' },
  { code: 'CREATE', name: 'Criar', module: 'general' },
  { code: 'EDIT', name: 'Editar', module: 'general' },
  { code: 'CANCEL', name: 'Cancelar', module: 'general' },
  { code: 'REVERSE', name: 'Estornar', module: 'general' },
  { code: 'DELETE', name: 'Excluir', module: 'general' },
  { code: 'PRINT', name: 'Imprimir', module: 'general' },
  { code: 'EXPORT', name: 'Exportar', module: 'general' },
  { code: 'CHANGE_PRICES', name: 'Alterar preços', module: 'pricing' },
  { code: 'VIEW_COSTS', name: 'Visualizar custos', module: 'finance' },
  { code: 'VIEW_PROFITS', name: 'Visualizar lucros', module: 'finance' },
  { code: 'MANAGE_USERS', name: 'Gerenciar usuários', module: 'admin' },
  { code: 'RESOLVE_CONFLICTS', name: 'Resolver conflitos', module: 'sync' },
  { code: 'MANUAL_SYNC', name: 'Sincronização manual', module: 'sync' },
] as const;

const ROLES = [
  { code: 'OWNER', name: 'Proprietário' },
  { code: 'ADMIN', name: 'Administrador' },
  { code: 'MANAGER', name: 'Gerente' },
  { code: 'CASHIER', name: 'Caixa' },
  { code: 'BUYER', name: 'Comprador' },
  { code: 'SELLER', name: 'Vendedor' },
  { code: 'SCALE_OPERATOR', name: 'Operador de balança' },
  { code: 'STOCKKEEPER', name: 'Estoquista' },
  { code: 'FINANCE', name: 'Financeiro' },
  { code: 'READONLY', name: 'Somente leitura' },
] as const;

const CONTACT_TYPES = [
  { code: 'CLIENT', name: 'Cliente' },
  { code: 'SUPPLIER', name: 'Fornecedor' },
  { code: 'BUYER_COMPANY', name: 'Empresa compradora' },
  { code: 'CARRIER', name: 'Transportadora' },
  { code: 'EMPLOYEE', name: 'Funcionário' },
  { code: 'PARTNER', name: 'Parceiro' },
  { code: 'OTHER', name: 'Outro' },
] as const;

const MATERIALS = [
  { code: 'FE-PES', name: 'Ferro pesado', unit: 'KG' as const, buy: 0.85, sell: 1.1 },
  { code: 'FE-LEV', name: 'Ferro leve', unit: 'KG' as const, buy: 0.55, sell: 0.75 },
  { code: 'CU-LIM', name: 'Cobre limpo', unit: 'KG' as const, buy: 32, sell: 38 },
  { code: 'CU-QUE', name: 'Cobre queimado', unit: 'KG' as const, buy: 26, sell: 31 },
  { code: 'AL-LIM', name: 'Alumínio limpo', unit: 'KG' as const, buy: 8.5, sell: 10.5 },
  { code: 'AL-PER', name: 'Alumínio perfil', unit: 'KG' as const, buy: 7.8, sell: 9.8 },
  { code: 'BRONZE', name: 'Bronze', unit: 'KG' as const, buy: 18, sell: 22 },
  { code: 'LATÃO', name: 'Latão', unit: 'KG' as const, buy: 14, sell: 17 },
  { code: 'INOX', name: 'Inox', unit: 'KG' as const, buy: 4.5, sell: 6 },
  { code: 'PAPEL', name: 'Papelão', unit: 'KG' as const, buy: 0.4, sell: 0.65 },
  { code: 'PLAST', name: 'Plástico', unit: 'KG' as const, buy: 0.9, sell: 1.3 },
  { code: 'MISTA', name: 'Sucata mista', unit: 'KG' as const, buy: 0.7, sell: 0.95 },
];

async function main() {
  console.log('Seeding Bufalo Sucatas / FerroGestor...');

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module },
      create: p,
    });
  }

  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: r,
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'OWNER' } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const readonlyRole = await prisma.role.findUniqueOrThrow({ where: { code: 'READONLY' } });

  for (const role of [ownerRole, adminRole]) {
    for (const permission of allPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const viewPerm = allPermissions.find((p) => p.code === 'VIEW');
  if (viewPerm) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: readonlyRole.id,
          permissionId: viewPerm.id,
        },
      },
      update: {},
      create: { roleId: readonlyRole.id, permissionId: viewPerm.id },
    });
  }

  for (const ct of CONTACT_TYPES) {
    await prisma.contactType.upsert({
      where: { code: ct.code },
      update: { name: ct.name },
      create: ct,
    });
  }

  const company = await prisma.company.upsert({
    where: { documentCnpj: '00000000000191' },
    update: {
      legalName: 'Bufalo Sucatas Ltda',
      tradeName: 'Bufalo Sucatas',
      active: true,
      syncStatus: 'SYNCED',
    },
    create: {
      legalName: 'Bufalo Sucatas Ltda',
      tradeName: 'Bufalo Sucatas',
      documentCnpj: '00000000000191',
      addressCity: 'Brasília',
      addressState: 'DF',
      phone: '(61) 0000-0000',
      active: true,
      syncStatus: 'SYNCED',
    },
  });

  const branch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: 'MTZ' } },
    update: { name: 'Matriz' },
    create: {
      companyId: company.id,
      code: 'MTZ',
      name: 'Matriz',
      addressCity: 'Brasília',
      addressState: 'DF',
      syncStatus: 'SYNCED',
    },
  });

  await prisma.warehouse.upsert({
    where: { branchId_code: { branchId: branch.id, code: 'DEP-01' } },
    update: { name: 'Depósito Principal' },
    create: {
      companyId: company.id,
      branchId: branch.id,
      code: 'DEP-01',
      name: 'Depósito Principal',
      syncStatus: 'SYNCED',
    },
  });

  const passwordHash = await argon2.hash(SEED_ADMIN_PASSWORD);
  await prisma.user.upsert({
    where: {
      companyId_username: { companyId: company.id, username: SEED_ADMIN_USER },
    },
    update: { passwordHash, fullName: 'Administrador Bufalo', roleId: ownerRole.id },
    create: {
      companyId: company.id,
      branchId: branch.id,
      username: SEED_ADMIN_USER,
      passwordHash,
      fullName: 'Administrador Bufalo',
      roleId: ownerRole.id,
      syncStatus: 'SYNCED',
    },
  });

  const metals = await prisma.materialCategory.upsert({
    where: { companyId_code: { companyId: company.id, code: 'METAIS' } },
    update: { name: 'Metais' },
    create: {
      companyId: company.id,
      code: 'METAIS',
      name: 'Metais',
      syncStatus: 'SYNCED',
    },
  });

  for (const m of MATERIALS) {
    await prisma.material.upsert({
      where: { companyId_code: { companyId: company.id, code: m.code } },
      update: {
        name: m.name,
        defaultBuyPrice: m.buy,
        defaultSellPrice: m.sell,
      },
      create: {
        companyId: company.id,
        categoryId: metals.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        defaultBuyPrice: m.buy,
        defaultSellPrice: m.sell,
        syncStatus: 'SYNCED',
      },
    });
  }

  await prisma.financialAccount.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { name: 'Caixa Principal' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      companyId: company.id,
      name: 'Caixa Principal',
      accountType: 'CASH',
      syncStatus: 'SYNCED',
    },
  });

  const settingsSeed: Array<{ key: string; value: unknown; description: string }> = [
    { key: 'company.displayName', value: 'Bufalo Sucatas', description: 'Nome exibido no aplicativo' },
    { key: 'company.cnpj', value: '', description: 'CNPJ da empresa' },
    { key: 'company.address', value: '', description: 'Endereço para comprovantes' },
    { key: 'company.phone', value: '', description: 'Telefone' },
    { key: 'company.logoPath', value: '', description: 'Caminho do logo' },
    { key: 'print.paper', value: 'A4', description: 'Formato de papel' },
    { key: 'print.footerMessage', value: 'Obrigado pela preferência — Bufalo Sucatas', description: 'Rodapé PDF' },
    { key: 'print.showQrCode', value: false, description: 'Exibir QR Code' },
    { key: 'cash.requireDifferenceReason', value: true, description: 'Exigir justificativa no fechamento' },
    { key: 'cash.allowMultipleOpen', value: false, description: 'Permitir múltiplos caixas abertos' },
    { key: 'sales.commentsEnabled', value: true, description: 'Comentários em vendas' },
    { key: 'sync.apiBaseUrl', value: SEED_API_BASE, description: 'URL da API' },
    { key: 'sync.autoIntervalMinutes', value: 5, description: 'Intervalo de sync automático' },
  ];

  for (const s of settingsSeed) {
    await prisma.applicationSetting.upsert({
      where: { companyId_key: { companyId: company.id, key: s.key } },
      update: { value: s.value as object, description: s.description },
      create: {
        companyId: company.id,
        key: s.key,
        value: s.value as object,
        description: s.description,
        syncStatus: 'SYNCED',
      },
    });
  }

  console.log('Seed concluído.');
  console.log(`Empresa: ${company.tradeName} (${company.id})`);
  console.log(`Filial: ${branch.name}`);
  console.log(`Usuário API: ${SEED_ADMIN_USER} / (SEED_ADMIN_PASSWORD ou "admin")`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
