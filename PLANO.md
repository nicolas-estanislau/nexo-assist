# Plano: Nexo Assist

Plano de implementação do desafio técnico (PRD v5). Referências: `Desafio_Tecnico_Nexo_Assist_PRD_v5.pdf` e o protótipo no Pencil (https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg).

## Stack

| Camada    | Escolha                                                   | Por quê                                              |
| --------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Monorepo  | pnpm workspaces                                           | Separação visível entre interface, agente e serviço  |
| Interface | Next.js (App Router) + Tailwind                           | Sugestão do PRD; o Pencil exporta HTML + Tailwind    |
| Agente    | Mastra                                                    | Preferência declarada no PRD                         |
| LLM       | Modelo rápido e barato por padrão (ex.: Claude Haiku 5.5) | Custo por conversa e tempo de resposta são avaliados |
| Banco     | SQLite + Drizzle ORM                                      | Persiste entre reinícios, zero configuração          |
| Validação | Zod                                                       | Saídas do LLM, inputs das tools e API                |
| Testes    | Vitest + suíte de cenários do agente                      | Mostra como a qualidade das decisões foi garantida   |

## Estrutura

```
nexo-assist/
├─ apps/
│  ├─ web/            → Next.js: telas, rotas de API, sessão, chat e console
│  └─ tickets-api/    → serviço de chamados "legado" (Hono + SQLite próprio)
├─ packages/
│  ├─ agent/          → Mastra: agente, tools, prompts, trace de decisão
│  ├─ domain/         → regras puras: prioridade, SLA, dedup, escopo
│  └─ shared/         → tipos e schemas Zod compartilhados
└─ evals/             → cenários de conversa com o resultado esperado
```

O `tickets-api` roda em porta separada e simula o sistema legado, com injeção de falhas configurável (indisponibilidade de alguns segundos e latência). O cliente usado pelo agente faz retry com backoff e timeout.

## Arquitetura do agente

O LLM interpreta; o código aplica as regras.

1. **LLM interpreta:** intenção, tipo, categoria, impacto, urgência, dados faltantes e `confidence`, com saída estruturada (Zod).
2. **Código decide as regras do Anexo A** (determinístico e testado):
   - prioridade = impacto × urgência, prazo em horas úteis;
   - deduplicação: busca chamados abertos parecidos antes de criar; reabre resolvidos há até 7 dias;
   - transferência: pedido do usuário, caso crítico, chamado vencido ou `confidence` abaixo do limite;
   - escopo: assuntos fora de TI são redirecionados.
3. **Guard-rails no código:**
   - `createTicket` só aceita `draftId` confirmado pelo usuário na interface;
   - `employeeId` vem da sessão, nunca do LLM (privacidade);
   - limite de 30 mensagens verificado no servidor;
   - conversa em `com_analista` não chama o agente.

**Tools:** `searchKnowledgeBase` (SQLite FTS5), `listMyTickets`, `getTicket`, `findSimilarOpenTickets`, `draftTicket`, `createTicket`, `updateTicket`, `reopenTicket`, `transferToAnalyst`.

**Trace de decisão** (gravado a cada turno):

```ts
{ understood: { intent, entities }, actions: [{ tool, label, input, resultSummary }],
  rulesApplied: ["Prioridade Alta: 1 pessoa + compromisso no mesmo dia"],
  confidence: 0.86, rationale: "..." }
```

Vira os chips "✓ consultou seus chamados" acima da resposta, com painel de detalhe ao clicar. O console do analista usa o mesmo registro ("Agent pediu ajuda · confiança 41%").

**Mensagens tipadas:** `text`, `quick_replies`, `ticket_select`, `ticket_card`, `draft_card`, `system_event`.

**Estado da conversa:** `agente → aguardando_analista → com_analista → (agente | encerrada)`

## Etapas

| #   | Etapa               | Entrega                                                                                                                                           |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Setup               | Monorepo, TS strict, ESLint, Prettier, Vitest, `.env.example`                                                                                     |
| 1   | Domínio             | Tipos, prioridade, SLA em horas úteis, dedup e testes                                                                                             |
| 2   | Serviço de chamados | API, seed (funcionários, 5 a 10 artigos, chamados variados), ownership, falhas simuladas                                                          |
| 3   | App base            | Banco de conversas, login com seed, sessão, máquina de estados                                                                                    |
| 4   | Agente              | Mastra, tools, saída estruturada, trace, guard-rails, retry                                                                                       |
| 5   | Chat                | Telas 1, 2, 3 e 6, streaming, cards, painel de decisões, loading e erro                                                                           |
| 6   | Console             | Telas 4 e 5: lista com filtros, assumir, devolver, encerrar, painel de chamados                                                                   |
| 7   | Qualidade           | Suíte de cenários: dúvida resolvida pela base, duplicado, Win10 vs. Win11, fora de escopo, chamado de outro funcionário, vencido, baixa confiança |
| 8   | Entrega             | README completo; deploy opcional (Railway ou Fly.io com volume para o SQLite)                                                                     |

## Telas do protótipo (1440×900, desktop)

1. **Login:** painel escuro com título serifado e mini-chat de exemplo; formulário à direita.
2. **Chat, novo chamado:** chips de ações, opções rápidas, card de rascunho com Confirmar/Editar/Cancelar, contador 16/30.
3. **Chat, consulta e transferência:** seleção de chamado, card com prazo vencido, oferta de chamar analista.
4. **Console, conversa transferida:** lista com filtros, conversa com agente pausado, Devolver ao agent / Assumir atendimento, painel de chamados.
5. **Console, analista atendendo:** mensagens do analista (Suporte N2), Devolver ao agent / Encerrar atendimento.
6. **Meu perfil:** nome, e-mail gerenciado pela TI, redefinir senha.
