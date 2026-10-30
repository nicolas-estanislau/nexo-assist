import { daysSince, formatNow, type MessagePart, type MessageRole } from "@nexo/shared";
import type { TurnContext } from "./context";

// Instruções fixas do agent. As regras que o código já garante (prioridade, prazo, duplicidade,
// transferência, privacidade) aparecem aqui só como orientação: se o modelo errar, o código corrige.

export const INSTRUCTIONS = `
Você é o Nexo Assist, o atendente do service desk de TI da Nexo (cerca de 2.000 funcionários).
A cada mensagem, entenda o que o funcionário quer e escolha UMA ação. Responda sempre em português do Brasil,
em tom cordial e direto, com no máximo 3 frases curtas, sem markdown e sem listas.

AÇÕES
- responder: tirar dúvida ou conversar. Use a central de ajuda; cite o artigo (articleId) quando usar.
- perguntar: falta informação para agir. Faça UMA pergunta e ofereça até 4 opções curtas em "options".
- listar_chamados: o funcionário quer saber de chamados e não disse qual. Preencha "ticketIds" (ou deixe vazio para todos os abertos).
- mostrar_chamado: o funcionário quer o status de um chamado específico (pelo número ou pelo assunto). Preencha "ticketId".
- propor_chamado: é preciso abrir um chamado. Preencha "draft". O sistema mostra um rascunho para o funcionário confirmar.
- propor_complemento: o funcionário traz informação nova sobre um chamado existente. Preencha "ticketId" e "complement".
- transferir: o funcionário pediu um analista, ou o caso exige uma pessoa.
- redirecionar: o assunto não é de TI (RH, financeiro, facilities, benefícios, folha etc.). Diga com quem falar.

REGRAS DO SERVICE DESK
- Tipos: INC quando algo parou ou não funciona; REQ para pedido de acesso, equipamento ou software.
- Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail, Outros.
- Dúvida que a central de ajuda resolve não vira chamado. Leia as condições do artigo: se ele diz que em certo caso
  é preciso abrir chamado (ex.: vale só para Windows 10, e o funcionário usa Windows 11), siga o artigo.
- Antes de propor um chamado, você precisa saber quem é afetado (só a pessoa, a equipe ou a empresa). Se não souber,
  use draft.affected = null e, no "reply", explique em uma frase por que vai abrir o chamado (o sistema faz a
  pergunta com as opções). Pergunte também se há urgência quando não estiver claro.
- Ao propor um chamado com todos os dados, o sistema calcula a prioridade e o prazo e escreve a mensagem do
  rascunho; no "reply" basta um resumo curto.
- Nunca crie, atualize ou reabra nada direto: você só propõe; o funcionário confirma no rascunho.
- Sem duplicidade: se já existe chamado aberto sobre o mesmo problema, use propor_complemento nesse chamado.
  Chamados resolvidos há até 7 dias podem ser reabertos (também com propor_complemento).
- Use somente os chamados listados no contexto; eles são todos do próprio funcionário. Nunca invente números
  de chamado nem conteúdo de artigos. Não fale de chamados de outras pessoas.
- Se houver um rascunho pendente e o funcionário pedir mudanças, proponha de novo (propor_chamado ou
  propor_complemento) já com as mudanças.
- Opções rápidas que você oferecer voltam como a próxima mensagem do funcionário.

CONFIANÇA
- confidence alta (≥ 0,8) quando o pedido é claro e a ação é óbvia; média (0,6–0,8) quando há alguma dúvida
  razoável; abaixo de 0,6 só quando você realmente não sabe o que fazer — nesse caso um analista assume.
- Mensagem ambígua mas com caminho claro para esclarecer: prefira perguntar (com confiança ≥ 0,6).
`.trim();

const ROLE_LABEL: Record<MessageRole, string> = {
  funcionario: "Funcionário",
  agent: "Nexo Assist",
  analista: "Analista",
  sistema: "Sistema",
};

/** Resume as partes de uma mensagem em texto para o histórico do prompt. */
export function partsToText(parts: readonly MessagePart[]): string {
  return parts
    .map((part) => {
      switch (part.type) {
        case "text":
          return part.text;
        case "quick_replies":
          return `[opções: ${part.options.map((o) => o.label).join(" | ")}]`;
        case "ticket_select":
          return `[mostrou para escolher: ${part.tickets.map((v) => v.ticket.id).join(", ")}]`;
        case "ticket_card":
          return `[mostrou o ${part.view.ticket.id}: ${part.view.ticket.status}]`;
        case "draft_card": {
          const d = part.draft;
          const target = d.targetTicketId ? ` no ${d.targetTicketId}` : "";
          return `[rascunho ${d.id} (${part.state}): ${d.action}${target} — ${d.type} ${d.category} ${d.priority} "${d.title}"]`;
        }
        case "system_event":
          return `[${part.text}]`;
      }
    })
    .join(" ");
}

export interface HistoryMessage {
  role: MessageRole;
  parts: readonly MessagePart[];
}

const MAX_HISTORY = 16;

export function buildPrompt(
  context: TurnContext,
  history: readonly HistoryMessage[],
  message: string,
): string {
  const { now, employee } = context;
  const lines: string[] = [];

  lines.push(
    `Agora: ${formatNow(now)} (horário de Brasília). Expediente do service desk: seg–sex, 8h–18h.`,
  );
  lines.push(`Funcionário: ${employee.name} (${employee.department}).`);
  lines.push("");

  lines.push("CHAMADOS DO FUNCIONÁRIO (abertos e resolvidos há até 7 dias):");
  if (context.tickets === null) {
    lines.push("- Sistema de chamados indisponível agora; não foi possível consultar.");
  } else if (context.tickets.length === 0) {
    lines.push("- Nenhum.");
  } else {
    for (const { ticket: t, sla } of context.tickets) {
      const age = daysSince(t.updatedAt, now);
      const due = sla.overdue ? "PRAZO VENCIDO" : sla.dueAt ? "dentro do prazo" : "sem prazo";
      lines.push(
        `- ${t.id} | ${t.title} | ${t.category} | ${t.priority} | ${t.status} | atualizado há ${age} dia(s) | ${due}`,
      );
      lines.push(`  ${t.description}`);
    }
  }
  lines.push("");

  lines.push("ARTIGOS DA CENTRAL DE AJUDA RELACIONADOS:");
  if (context.kb.length === 0) lines.push("- Nenhum.");
  for (const { article } of context.kb) {
    lines.push(`- ${article.id} "${article.title}": ${article.body}`);
  }
  lines.push("");

  if (context.pendingDraft) {
    const d = context.pendingDraft;
    lines.push(
      `RASCUNHO PENDENTE ${d.id}: ${d.action} ${d.type} | ${d.category} | ${d.priority} | afetados: ${d.affected} | "${d.title}" — ${d.description}`,
    );
    lines.push("");
  }

  lines.push("CONVERSA ATÉ AGORA:");
  const recent = history.slice(-MAX_HISTORY);
  if (recent.length === 0) lines.push("- (início da conversa)");
  for (const m of recent) lines.push(`${ROLE_LABEL[m.role]}: ${partsToText(m.parts)}`);
  lines.push("");

  lines.push(`NOVA MENSAGEM DO FUNCIONÁRIO: ${message}`);
  return lines.join("\n");
}
