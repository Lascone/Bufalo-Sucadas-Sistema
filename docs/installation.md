# Instalação

## Servidor (desenvolvimento)

1. Instale Node 20+ e pnpm 9+.
2. Na raiz do monorepo:

```bash
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:generate
pnpm db:migrate:central
pnpm db:seed
pnpm dev:server
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- Usuário seed: `admin` / `Admin@123`

## Desktop (desenvolvimento)

```bash
# Defina LOCAL_DATABASE_URL (SQLite)
# Ex.: LOCAL_DATABASE_URL="file:./data/ferrogestor-local.db"
pnpm db:generate
pnpm --filter @ferrogestor/database migrate:local
pnpm dev:desktop
```

## Produção — Docker Compose

```bash
docker compose up -d
# Configure DATABASE_URL no servidor e rode migrate deploy + seed
```

## Releases e atualização automática

```bash
git tag v0.1.0
git push origin v0.1.0
```

O workflow `.github/workflows/release.yml` publica o instalador NSIS. O app verifica updates no canal `stable`.

Antes de aplicar update, o desktop faz backup do SQLite. Se a migration local falhar, o backup é restaurado.

## Variáveis

Veja [`.env.example`](../.env.example). **Nunca** coloque a senha do PostgreSQL no aplicativo desktop.
