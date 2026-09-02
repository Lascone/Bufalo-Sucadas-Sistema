# FerroGestor

Sistema profissional de gestão para ferro-velho e comércio de materiais recicláveis.

**Empresa:** Bufalo Sucatas  
**Nome provisório do produto:** FerroGestor  
**Arquitetura:** offline-first (Electron → PostgreSQL central integrado; API NestJS opcional)

## Stack

| Camada | Tecnologias |
|--------|-------------|
| Desktop | Electron, React, TypeScript, Vite, Tailwind, Zustand, Prisma → PostgreSQL |
| Servidor | NestJS (opcional/admin), Prisma + PostgreSQL, JWT + Argon2, Swagger |
| Shared | Zod schemas, tipos de sync, constantes |
| Deploy desktop | Electron Builder (NSIS) + electron-updater (GitHub Releases) |

## Offline-first (sem Docker)

- **Não usa Docker** no dia a dia.
- O app abre **offline** sem configurar nada; a fila fica no PC.
- Em **Configurações → Banco online** informe o PostgreSQL; o próprio Electron sincroniza (sem API no caixa).
- A API NestJS continua no monorepo para admin/dev, mas não é necessária na instalação.

## Estrutura do monorepo

```text
apps/
  desktop/     # Aplicativo Windows offline-first
  server/      # API REST opcional (admin/dev)
packages/
  shared/      # Tipos e contratos compartilhados
  database/    # Schemas Prisma + sync-core (PostgreSQL central)
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
Usuário seed: `admin` / `BFSucata!2026`

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
