# Nexo Assist

Agent de atendimento do service desk de TI da Nexo: o funcionário descreve o problema num chat, e o agent consulta chamados, busca na central de ajuda, abre ou atualiza chamados e transfere para um analista quando precisa.

> Em construção. O plano de implementação está em [PLANO.md](PLANO.md).

## Requisitos

- Node.js 22+
- pnpm 10+

## Como rodar

```bash
pnpm install
cp .env.example .env   # preencha as variáveis
pnpm check             # typecheck, lint, formatação e testes
```

### Serviço de chamados

```bash
pnpm --filter @nexo/tickets-api dev       # sobe em http://localhost:4000
pnpm --filter @nexo/tickets-api db:reset  # recria o banco com os dados de exemplo
```

Na primeira subida o banco SQLite é criado em `apps/tickets-api/data/` com funcionários, artigos da central de ajuda e chamados de exemplo. As datas são relativas ao momento do seed, então as situações (chamado vencido, resolvido há 4 dias etc.) continuam valendo. Rode `db:reset` para reiniciar o relógio.

## Estrutura

| Pacote                    | Papel                                                                             |
| ------------------------- | --------------------------------------------------------------------------------- |
| `packages/shared`         | Vocabulário do service desk e contrato da API (schemas Zod)                       |
| `packages/domain`         | Regras do Anexo A: prioridade, prazos em horas úteis, duplicidade, transferência  |
| `apps/tickets-api`        | Sistema de chamados "legado" simulado (Hono + SQLite), com quedas e latência      |
| `packages/tickets-client` | Cliente tipado do sistema de chamados, com timeout, retry e chave de idempotência |

### Serviço de chamados simulado

- **Separado do agent:** roda em outra porta e só aceita chamadas com o token compartilhado (`TICKETS_API_TOKEN`).
- **Privacidade no próprio serviço:** toda chamada informa em nome de quem é feita (`X-Actor-Id`). Funcionário só vê os próprios chamados; o chamado de outra pessoa responde 404, como se não existisse.
- **Instável de propósito:** `TICKETS_FAILURE_RATE` derruba o serviço por `TICKETS_OUTAGE_SECONDS` segundos, respondendo 503 com `Retry-After`. A central de ajuda não é afetada.
- **Retry seguro:** o cliente repete o pedido com backoff exponencial e respeita o `Retry-After`. Escritas levam uma `Idempotency-Key`; se a resposta se perder e o pedido for repetido, o serviço devolve o resultado original em vez de criar um chamado duplicado.

### Usuários de exemplo

Qualquer senha é aceita.

| E-mail                      | Papel                    |
| --------------------------- | ------------------------ |
| `ana.souza@nexo.com.br`     | Funcionária (Financeiro) |
| `bruno.tavares@nexo.com.br` | Funcionário (Comercial)  |
| `rafael.lima@nexo.com.br`   | Analista Suporte N2      |
| `juliana.costa@nexo.com.br` | Analista Suporte N1      |
