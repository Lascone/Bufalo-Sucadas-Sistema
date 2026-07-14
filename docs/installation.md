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

O GitHub Actions de release está **desligado** (billing/limite da conta).

Publicar update **na sua máquina** (sobe o `.exe` + `latest.yml` no GitHub Releases):

```powershell
# logado no gh (gh auth login)
pwsh ./scripts/release-desktop.ps1
# ou com bump:
pwsh ./scripts/release-desktop.ps1 -Version 0.1.2
```

No app instalado (versão empacotada, não `pnpm dev`): **Configurações → Verificar atualizações**.

**Repo privado:** o download do update no GitHub exige autenticação. Para testar sem token no app, deixe o repositório público ou hospede o instalador em um link HTTP aberto (S3/R2) e troque o `publish` do electron-builder para `generic`.

O desktop usa `electron-updater`, faz backup do SQLite e aplica a versão nova.

## Variáveis

Veja [`.env.example`](../.env.example). **Nunca** coloque a URL do banco central no app desktop — só a API.
