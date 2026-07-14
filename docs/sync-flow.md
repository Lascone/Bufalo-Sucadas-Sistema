# Fluxo de sincronização

## Camadas

1. **Desktop:** armazenamento local + fila (`sync-queue`)
2. **API NestJS:** recebe push/pull com JWT
3. **MongoDB Atlas:** fonte central das operações sincronizadas (quando online)

Sem internet o desktop continua normal; a fila fica `PENDING` até reconectar.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/health` | SQLite local + MongoDB |
| POST | `/api/v1/sync/push` | Lote idempotente → Mongo |
| GET | `/api/v1/sync/pull` | Mudanças remotas do Mongo |
| GET | `/api/v1/sync/status` | Pendências/conflitos |
| POST | `/api/v1/sync/conflicts/:id/resolve` | Resolução manual |

Coleções Mongo: `sync_entities`, `sync_queue`, `sync_receipts`, `sync_conflicts`, `sync_logs`.

Configure `MONGODB_URI` no `.env` (nunca no app desktop).
