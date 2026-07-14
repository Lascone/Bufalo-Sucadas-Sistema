# FerroGestor

Sistema profissional de gestão para ferro-velho e comércio de materiais recicláveis.

**Empresa:** Bufalo Sucatas  
**Nome provisório do produto:** FerroGestor  
**Arquitetura:** offline-first (Electron + SQLite → API NestJS + SQLite central local)

## Stack

| Camada | Tecnologias |
|--------|-------------|
| Desktop | Electron, React, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, Zustand, Prisma + SQLite |
| Servidor | NestJS (Fastify), Prisma + SQLite local, JWT + Argon2, Swagger |
| Shared | Zod schemas, tipos de sync, constantes |
| Deploy desktop | Electron Builder (NSIS) + electron-updater (GitHub Releases) |

## Offline-first (sem Docker)

- **Não usa Docker** no dia a dia.
- Sem internet o **desktop continua normal** (compras, vendas, cadastros no SQLite local).
- A sync com a API só pausa; nada é perdido.
- Banco central remoto (MariaDB/Mongo etc.) pode ser plugado depois sem mudar o modo offline.

## Estrutura do monorepo

```text
apps/
  desktop/     # Aplicativo Windows offline-first
  server/      # API REST de sync (também local)
packages/
  shared/      # Tipos e contratos compartilhados
  database/    # Schemas Prisma (SQLite desktop + SQLite central)
docs/          # Arquitetura, modelo de dados, sync, instalação
```

## Pré-requisitos

- Node.js 20+
- pnpm 9+

## Início rápido

```bash
pnpm install
cp .env.example .env

pnpm db:generate
pnpm db:push
pnpm db:seed

pnpm dev:server    # API em http://localhost:3000
pnpm dev:desktop   # App Electron
```

Documentação da API (Swagger): `http://localhost:3000/docs`  
Usuário seed: `admin` / `Admin@123`

## Atualização automática

Releases são publicadas automaticamente ao criar uma tag Git semântica:

```bash
git tag v0.2.0
git push origin v0.2.0
```

O GitHub Actions gera o instalador Windows e publica no GitHub Releases. O desktop usa `electron-updater` para baixar, validar hash, fazer backup do SQLite e instalar.

## Documentação

- [Arquitetura](docs/architecture.md)
- [Modelo de dados](docs/data-model.md)
- [Fluxo de sincronização](docs/sync-flow.md)
- [Resolução de conflitos](docs/conflict-resolution.md)
- [Instalação](docs/installation.md)

## Licença

Uso proprietário — Bufalo Sucatas. Todos os direitos reservados.
