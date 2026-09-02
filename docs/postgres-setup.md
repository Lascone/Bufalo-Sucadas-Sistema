# PostgreSQL 16 — setup Bufalo Sucata Gestor

Credenciais **não** ficam no código. Configure no app:
**Configurações → Banco online** (IP, porta, database, usuário, senha + API).

## Criar usuário no VPS

```bash
psql -h SEU_IP -p 5432 -U postgres -d postgres
```

```sql
SET password_encryption = 'scram-sha-256';
CREATE USER bufalo_app WITH PASSWORD 'SuaSenhaForte';
CREATE DATABASE bufalo_gestor OWNER bufalo_app ENCODING 'UTF8' TEMPLATE template0;
\c bufalo_gestor
GRANT CONNECT ON DATABASE bufalo_gestor TO bufalo_app;
GRANT USAGE, CREATE ON SCHEMA public TO bufalo_app;
```

Se o usuário já existe mas falha SCRAM:

```sql
SET password_encryption = 'scram-sha-256';
ALTER USER bufalo_app WITH PASSWORD 'SuaSenhaForte';
SELECT left(rolpassword, 16) FROM pg_authid WHERE rolname = 'bufalo_app';
-- deve começar com SCRAM-SHA-256$
```

## Schema e seed (máquina de desenvolvimento)

Exporte a URL e rode:

```powershell
$env:DATABASE_URL = "postgresql://bufalo_app:SENHA@IP:5432/bufalo_gestor?schema=public"
$env:SEED_ADMIN_USER = "admin"
$env:SEED_ADMIN_PASSWORD = "sua_senha_api"
pnpm db:generate
pnpm db:push
pnpm db:seed
```

## API

O desktop salva host/usuário/senha em **Configurações → Banco online** e conecta com Prisma direto (sem API no PC).

Para seed/migrate/admin, use `DATABASE_URL` no `.env`. A API NestJS é opcional (`GET http://IP:3000/api/v1/health`).
