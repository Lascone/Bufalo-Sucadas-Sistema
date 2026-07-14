# Resolução de conflitos

Quando o mesmo registro é alterado em dois dispositivos antes da sync, o sistema **não sobrescreve silenciosamente**.

## Estratégias por domínio

| Domínio | Estratégia | Comportamento |
|---------|------------|---------------|
| Cadastros simples (contato, material) | `LAST_WRITE_WINS` | Mais recente vence; histórico em auditoria |
| Estoque | `MOVEMENT_ONLY` | Nunca replace de saldo; só movimentações |
| Financeiro finalizado | `REQUIRES_REVERSAL` | Estorno/ajuste; sem edit direta |
| Compra/venda finalizada | `REQUIRES_REVERSAL` | Cancelamento / estorno / correção |
| Cadastros sensíveis / pesagem | `MANUAL` | Admin escolhe versão |

Mapeamento em `@ferrogestor/shared` → `ENTITY_CONFLICT_STRATEGY`.

## Detecção

Conflito de versão quando:

```text
localVersion != baseVersion AND remoteVersion != baseVersion AND localVersion != remoteVersion
```

## Tela de conflitos

Exibe:

- Valor local vs servidor
- Data e usuário de cada alteração
- Manter local / Manter servidor / Mesclar
- Campo obrigatório de justificativa

Resolução: `POST /api/v1/sync/conflicts/:id/resolve` com `KEEP_LOCAL` | `KEEP_SERVER` | `MERGE`.
