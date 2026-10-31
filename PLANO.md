# Plano: Nexo Assist

Plano de implementação do desafio técnico (PRD v5). Referências: `Desafio_Tecnico_Nexo_Assist_PRD_v5.pdf` e o protótipo no Pencil (https://app.pen.dev/s/swhm7Xfy1krKDIc-QyqE9J8ZI2xFB0qbNvHIncCXcLg).

## Stack

| Camada    | Escolha                                         | Por quê                                              |
| --------- | ----------------------------------------------- | ---------------------------------------------------- |
| Monorepo  | pnpm workspaces                                 | Separação visível entre interface, agente e serviço  |
| Interface | Next.js (App Router) + Tailwind                 | Sugestão do PRD; o Pencil exporta HTML + Tailwind    |
| Agente    | Mastra                                          | Preferência declarada no PRD                         |
| LLM       | Claude Haiku 5.5 (configurável via `LLM_MODEL`) | Custo por conversa e tempo de resposta são avaliados |
| Banco     | SQLite + Drizzle ORM                            | Persiste entre reinícios, zero configuração          |
| Validação | Zod                                             | Saídas do LLM, inputs das tools e API                |
| Testes    | Vitest + suíte de cenários do agente            | Mostra como a qualidade das decisões foi garantida   |

## Estrutura

```
nexo-assist/
├─ apps/
│  ├─ web/            → Next.js: telas, rotas de API, sessão, chat e console
│  └─ tickets-api/    → serviço de chamados "legado" (Hono + SQLite próprio)
├─ packages/
│  ├─ agent/          → Mastra: agente, tools, prompts, trace de decisão
│  ├─ domain/         → regras puras: prioridade, SLA, dedup, escopo
│  ├─ shared/         → tipos e schemas Zod compartilhados
│  └─ evals/          → cenários de conversa com o resultado esperado
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

### Detalhes das telas (revistos no Pencil em 30/10)

**Chat (telas 2 e 3)**

- Coluna de mensagens centrada (~660 px). Sem avatar: o agent tem uma linha "Nexo Assist ✓ consultou seus chamados ✓ buscou na central de ajuda" (texto miúdo, sem caixa) acima do balão.
- Balão do agent: branco com borda, cantos ~8 px. Pergunta e opções rápidas ficam dentro do balão: pergunta em negrito, opções como botões pequenos com borda (a escolhida fica em azul claro).
- Balão do funcionário: escuro (ink), texto branco, alinhado à direita.
- Rascunho: cabeçalho "Novo chamado · Rascunho D-381" e "● Aguardando confirmação" (laranja); título grande; descrição; três colunas (Categoria, Prioridade "● Alta · resposta até 13:43", Afetados "Somente você"); rodapé cinza com Confirmar (azul, dica ⌘↵), Editar (com borda) e Cancelar (texto).
- Seleção de chamado: lista com rádio, id miúdo, título, status com ponto colorido e data ("16 out"). Ao escolher, a mensagem do funcionário vira "INC-20311 · Notebook lento após atualização".
- Card do chamado: "Chamado · INC-20311" e status com ponto à direita; título; descrição; quatro colunas (Categoria "Hardware › Notebook", Prioridade, Aberto em "16 out, 14:20", Última atualização "há 5 dias · prazo vencido" em laranja).
- Texto do vencido e as opções no mesmo balão, abaixo do card.
- Campo "Escreva para o Nexo…" com botão "↑ Enviar"; abaixo, à direita, "16/30 mensagens nesta sessão".

**Console (telas 4 e 5)**

- Três colunas: lista de conversas (busca "Pesquisar conversa ou chamado"; filtros Todas / Para você 3 / Com o agent 9 / Minhas 1; "● Disponível" no topo), conversa ao centro e painel "Chamados da Ana" à direita (3 abertos · 2 encerrados).
- Item da lista: avatar com ponto online, nome, hora, última mensagem (com ✓✓ quando é do Nexo), contador de não lidas e uma linha de status colorida: "● Transferida · INC-20311" (vermelho), "● Transferida · contato em 25 min", "● Agent pediu ajuda · confiança 41%" (laranja), "● Agent atendendo" (verde), "● Resolvida pelo agent" (cinza), "● Você está atendendo" (azul).
- Cabeçalho da conversa: avatar, nome, "online · Financeiro · INC-20311"; pílula "Aguardando atendente".
- Na visão do analista, o funcionário fica à esquerda (balão branco) e o agent à direita (balão azul claro, "Nexo Assist IA"). Mensagens do analista: verde claro, "Rafael Lima" + selo "Suporte N2". Eventos centralizados com linha: "⇄ Transferida para Suporte N2 · 10:05", "🎧 Rafael Lima assumiu · agent pausado · 10:12".
- Aguardando (tela 4): barra inferior "✋ Ana espera um atendente · Agent pausado · até 12:05", botões "Devolver ao agent" e "Assumir atendimento" (azul); campo desabilitado "Assuma o atendimento para responder".
- Assumido (tela 5): no cabeçalho "Devolver ao agent" e "Encerrar atendimento" (vermelho claro); campo livre com botão de enviar redondo.
- Painel direito: "Desta conversa" (card do chamado em foco com status, título, categoria · prioridade e "⇄ Transferido para um analista 10:05" / "🎧 Assumido por Rafael Lima"); "Outros chamados" (lista com ponto de status, título, id · status ou "Resolvido em 02 set"); botão "Ver todos os chamados da Ana ↗".
