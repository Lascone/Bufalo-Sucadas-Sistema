# FerroGestor

Sistema profissional de gestão para ferro-velho e comércio de materiais recicláveis.

**Empresa:** Bufalo Sucatas  
**Nome provisório do produto:** FerroGestor  
**Arquitetura:** offline-first (Electron + SQLite local → API NestJS + PostgreSQL central)

## Stack

| Camada | Tecnologias |
|--------|-------------|
| Desktop | Electron, React, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, Zustand, Prisma + SQLite |
| Servidor | NestJS (Fastify), Prisma + PostgreSQL, JWT + Argon2, Swagger |
| Shared | Zod schemas, tipos de sync, constantes |
| Deploy desktop | Electron Builder (NSIS) + electron-updater (GitHub Releases) |

## Estrutura do monorepo

```text
apps/
  desktop/     # Aplicativo Windows offline-first
  server/      # API REST central
packages/
  shared/      # Tipos e contratos compartilhados
  database/    # Schemas Prisma (local SQLite + central PostgreSQL)
docs/          # Arquitetura, modelo de dados, sync, instalação
```

## Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker (para PostgreSQL local)

## Início rápido

```bash
# Instalar dependências
pnpm install

# Subir PostgreSQL
pnpm docker:up

# Copiar variáveis de ambiente
cp .env.example .env

# Gerar clients Prisma e migrar
pnpm db:generate
pnpm db:migrate:central
pnpm db:seed

# Desenvolvimento
pnpm dev:server    # API em http://localhost:3000
pnpm dev:desktop   # App Electron
```

Documentação da API (Swagger): `http://localhost:3000/docs`

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
