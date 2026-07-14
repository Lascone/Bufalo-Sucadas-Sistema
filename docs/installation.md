# Instalação

## Banco e sync

- **Desktop / auth local:** SQLite (`DATABASE_URL` / `LOCAL_DATABASE_URL`)
- **Sync online:** MongoDB Atlas (`MONGODB_URI` no `.env` do servidor)

Internet caída: o desktop segue; só a sincronização pausa.

## Servidor + banco central local

```bash
pnpm install
cp .env.example .env

# Ajuste DATABASE_URL no .env para um caminho absoluto do SQLite central, se precisar
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev:server
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- Usuário seed: `admin` / `Admin@123`

## Desktop

```bash
pnpm dev:desktop
```

O desktop grava no SQLite local (`LOCAL_DATABASE_URL`). Sync com a API é opcional e só ocorre quando a API estiver online.

## Releases e atualização automática

```bash
git tag v0.1.0
git push origin v0.1.0
```

O workflow publica o instalador NSIS. Antes do update, o desktop faz backup do SQLite.

## Variáveis

Veja [`.env.example`](../.env.example). **Nunca** coloque a URL do banco central no app desktop — só a API.
