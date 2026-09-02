# Fluxo de sincronização

## Camadas

1. **Desktop (Electron):** localStorage + fila JSON (`sync-queue.json` no userData)
2. **Sync core integrado:** o próprio app chama `createSyncCore` (Prisma) — sem API HTTP no PC da empresa
3. **PostgreSQL 16:** fonte central (`sync_entities`, `sync_queue`, `sync_operation_receipts`, `sync_conflicts`, `sync_logs`)

Sem internet / sem banco configurado o desktop continua normal; a fila fica `PENDING` até conectar o PostgreSQL em **Configurações → Banco online**.

A API NestJS (`apps/server`) continua disponível para uso opcional (dev/admin), mas **não é necessária** na instalação do Búfalo Sucata Gestor.

## Dois PCs

```text
PC A (offline) → grava local + enfileira
PC B (offline) → grava local + enfileira
PC A com Postgres → push direto → PostgreSQL
PC B com Postgres → push + pull paginado → aplica no localStorage
```

IDs UUID evitam colisão de CREATE. UPDATE na mesma versão gera conflito (KEEP_LOCAL / KEEP_SERVER) via IPC na tela Conflitos.

## Configuração no app

1. Instalar e abrir (funciona offline).
2. **Configurações → Banco online:** host, porta, database, usuário, senha e nome deste PC.
3. **Testar e salvar** — o app registra o dispositivo e sincroniza.
4. **Central de Sync → Sincronizar agora** quando quiser forçar.

Pull baixa o histórico em páginas (até esgotar `hasMore`), então um PC novo recebe o histórico completo.

Configure `DATABASE_URL` no `.env` só para seed/migrate no servidor (ver [postgres-setup.md](./postgres-setup.md)).
