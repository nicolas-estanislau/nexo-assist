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

```bash
pnpm dev                                  # app em http://localhost:3000 e chamados em :4000
pnpm --filter @nexo/tickets-api db:reset  # recria o banco de chamados com os dados de exemplo
```

Na primeira subida o banco SQLite é criado em `apps/tickets-api/data/` com funcionários, artigos da central de ajuda e chamados de exemplo. As datas são relativas ao momento do seed, então as situações (chamado vencido, resolvido há 4 dias etc.) continuam valendo. Rode `db:reset` para reiniciar o relógio.

## Estrutura

| Pacote                    | Papel                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `packages/shared`         | Vocabulário do service desk e contrato da API (schemas Zod)                        |
| `packages/domain`         | Regras do Anexo A: prioridade, prazos em horas úteis, duplicidade, transferência   |
| `apps/tickets-api`        | Sistema de chamados "legado" simulado (Hono + SQLite), com quedas e latência       |
| `apps/web`                | App Next.js: login, chat do funcionário, console do analista e banco das conversas |
| `packages/sqlite`         | Abertura do SQLite (libsql) com migrações versionadas, usada pelos dois bancos     |
| `packages/tickets-client` | Cliente tipado do sistema de chamados, com timeout, retry e chave de idempotência  |

### Serviço de chamados simulado

- **Separado do agent:** roda em outra porta e só aceita chamadas com o token compartilhado (`TICKETS_API_TOKEN`).
- **Privacidade no próprio serviço:** toda chamada informa em nome de quem é feita (`X-Actor-Id`). Funcionário só vê os próprios chamados; o chamado de outra pessoa responde 404, como se não existisse.
- **Instável de propósito:** `TICKETS_FAILURE_RATE` derruba o serviço por `TICKETS_OUTAGE_SECONDS` segundos, respondendo 503 com `Retry-After`. A central de ajuda não é afetada.
- **Retry seguro:** o cliente repete o pedido com backoff exponencial e respeita o `Retry-After`. Escritas levam uma `Idempotency-Key`; se a resposta se perder e o pedido for repetido, o serviço devolve o resultado original em vez de criar um chamado duplicado.

### App web

- **Sessão:** JWT assinado (HS256) num cookie `httpOnly`. "Manter conectado" vale por 30 dias; sem ele, o cookie some ao fechar o navegador.
- **Autorização em duas camadas:** o `proxy.ts` faz a checagem otimista (sem sessão vai para o login, funcionário não entra no console e vice-versa), e cada página e ação refaz a checagem em `server/auth.ts`, perto dos dados.
- **Estado da conversa:** a máquina de estados fica no domínio (`agente → aguardando_analista → com_analista → agente | encerrada`). O banco só grava transições que ela aceita, e a gravação é condicionada ao estado lido, então dois analistas assumindo ao mesmo tempo não dão conflito silencioso.
- **Cache Components desligado:** quase toda tela depende do usuário logado (chat, chamados, console), então o cache de páginas estáticas do Next 16 traria complexidade sem ganho.

### Usuários de exemplo

Qualquer senha é aceita.

| E-mail                      | Papel                    |
| --------------------------- | ------------------------ |
| `ana.souza@nexo.com.br`     | Funcionária (Financeiro) |
| `bruno.tavares@nexo.com.br` | Funcionário (Comercial)  |
| `rafael.lima@nexo.com.br`   | Analista Suporte N2      |
| `juliana.costa@nexo.com.br` | Analista Suporte N1      |
