import {
  canReopen,
  classifyPriority,
  computeDueAt,
  decideTransfer,
  findDuplicate,
  SLA_POLICIES,
} from "@nexo/domain";
import {
  daysSince,
  formatDue,
  OPEN_STATUSES,
  plural,
  type MessagePart,
  type SupportLevel,
  type Ticket,
  type TicketDraft,
  type TicketPriority,
  type TicketView,
} from "@nexo/shared";
import type { TurnContext } from "./context";
import type { TurnDecision } from "./decision";
import type { TraceRecorder } from "./trace";

// Aplica as regras do service desk sobre a sugestão do LLM. O LLM interpreta a conversa; este
// módulo decide o que de fato acontece. Quando a regra muda a ação sugerida, a resposta ao
// funcionário também passa a ser gerada aqui, para nunca contradizer o que foi feito.

export interface TransferOutcome {
  reason: string;
  summary: string;
  confidence: number;
  ticketId: string | null;
  level: SupportLevel;
}

export interface PolicyOutcome {
  parts: MessagePart[];
  transfer: TransferOutcome | null;
}

const AFFECTED_OPTIONS = [
  { label: "Só eu", value: "Só eu" },
  { label: "Minha equipe", value: "Minha equipe" },
  { label: "Toda a empresa", value: "Toda a empresa" },
  { label: "Não sei", value: "Não sei" },
];

const OVERDUE_OPTIONS = [
  { label: "Falar com um analista", value: "Quero falar com um analista." },
  { label: "Adicionar informação", value: "Quero adicionar uma informação ao chamado." },
  { label: "Não, obrigado", value: "Não, obrigado." },
];

const text = (value: string): MessagePart => ({ type: "text", text: value });

export function supportLevelFor(priority: TicketPriority | null, overdue: boolean): SupportLevel {
  return overdue || priority === "Crítica" || priority === "Alta" ? "N2" : "N1";
}

function newDraftId(): string {
  return `D-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

function draftSla(priority: TicketPriority, now: Date): TicketDraft["sla"] {
  return {
    dueAt: computeDueAt(priority, now).toISOString(),
    overdue: false,
    label: SLA_POLICIES[priority].label,
  };
}

/** Rascunho para complementar ou reabrir um chamado existente. */
function draftForExisting(
  ticket: Ticket,
  action: "update" | "reopen",
  complement: string,
  now: Date,
): TicketDraft {
  return {
    id: newDraftId(),
    action,
    targetTicketId: ticket.id,
    type: ticket.type,
    title: ticket.title,
    description: complement,
    category: ticket.category,
    priority: ticket.priority,
    priorityReason: "Mantida a prioridade do chamado.",
    affected: ticket.affected,
    sla: draftSla(ticket.priority, now),
  };
}

export function applyPolicy(
  decision: TurnDecision,
  context: TurnContext,
  trace: TraceRecorder,
): PolicyOutcome {
  const { now } = context;
  const known = new Map((context.tickets ?? []).map((v) => [v.ticket.id, v]));
  const openViews = (context.tickets ?? []).filter((v) => OPEN_STATUSES.includes(v.ticket.status));

  // 1. Sem o sistema de chamados, nada que dependa dele é feito às cegas.
  const needsTickets = [
    "listar_chamados",
    "mostrar_chamado",
    "propor_chamado",
    "propor_complemento",
  ].includes(decision.action);
  if (context.tickets === null && needsTickets) {
    trace.rule(
      "Sistema de chamados indisponível: nenhuma ação sobre chamados sem consultar antes.",
    );
    return {
      parts: [
        text(
          "O sistema de chamados está instável agora e não consegui consultar seus chamados. Pode tentar de novo em alguns segundos?",
        ),
        {
          type: "quick_replies",
          question: null,
          options: [{ label: "Tentar de novo", value: "Tente de novo, por favor." }],
        },
      ],
      transfer: null,
    };
  }

  const focus = decision.ticketId ? known.get(decision.ticketId) : undefined;
  const userRequested = decision.userAskedForHuman || decision.action === "transferir";

  // 2. Chamado que não está entre os do funcionário: a resposta é a da privacidade, mesmo com
  // confiança baixa. Não há dúvida para um analista resolver, e transferir pareceria uma brecha.
  const asksAboutTicket = ["mostrar_chamado", "propor_complemento"].includes(decision.action);
  if (asksAboutTicket && decision.ticketId && !focus && !userRequested) {
    return ticketNotFound(decision.ticketId, openViews, trace);
  }

  // 3. Transferência: pedido do funcionário, caso crítico ou baixa confiança (Anexo A).
  const transfer = decideTransfer({
    userRequested,
    priority: focus?.ticket.priority ?? null,
    overdue: focus?.sla.overdue ?? false,
    confidence: decision.confidence,
  });
  if (transfer.decision === "transfer") {
    for (const reason of transfer.reasons) trace.rule(`Transferência: ${reason}`);
    const level = supportLevelFor(focus?.ticket.priority ?? null, focus?.sla.overdue ?? false);
    const message = userRequested
      ? `Encaminhei para o Suporte ${level}. Um analista vai continuar esta conversa por aqui, com todo o histórico, então você não precisa repetir nada.`
      : "Não tenho segurança sobre como resolver isso, então chamei um analista para continuar daqui. Ele vai ver toda a nossa conversa.";
    return {
      parts: [text(message)],
      transfer: {
        reason: transfer.reasons.join(" "),
        summary: [
          decision.summary,
          focus
            ? `Chamado em foco: ${focus.ticket.id} (${focus.ticket.status}${focus.sla.overdue ? ", prazo vencido" : ""}).`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        confidence: decision.confidence,
        ticketId: focus?.ticket.id ?? null,
        level,
      },
    };
  }

  // 4. A ação sugerida, com as regras aplicadas.
  switch (decision.action) {
    case "responder":
    case "transferir":
      return { parts: [text(decision.reply)], transfer: null };

    case "redirecionar":
      trace.rule("Escopo: só assuntos de TI; outros temas são redirecionados.");
      return { parts: [text(decision.reply)], transfer: null };

    case "perguntar": {
      const options = decision.options.slice(0, 4).map((o) => ({ label: o, value: o }));
      return {
        parts:
          options.length > 0
            ? [text(decision.reply), { type: "quick_replies", question: null, options }]
            : [text(decision.reply)],
        transfer: null,
      };
    }

    case "listar_chamados": {
      const chosen = decision.ticketIds
        .map((id) => known.get(id))
        .filter((v): v is TicketView => v !== undefined && OPEN_STATUSES.includes(v.ticket.status));
      const views = chosen.length > 0 ? chosen : openViews;
      if (views.length === 0) {
        return {
          parts: [text("Você não tem chamados abertos no momento. Posso ajudar com outra coisa?")],
          transfer: null,
        };
      }
      if (views.length === 1 && views[0]) return showTicket(views[0], decision, context, trace);
      return {
        parts: [
          text(
            `Você tem ${plural(views.length, "chamado aberto", "chamados abertos")}. Sobre qual deles quer saber?`,
          ),
          { type: "ticket_select", tickets: views },
        ],
        transfer: null,
      };
    }

    case "mostrar_chamado": {
      if (!focus) return ticketNotFound(decision.ticketId, openViews, trace);
      return showTicket(focus, decision, context, trace);
    }

    case "propor_complemento": {
      if (!focus) return ticketNotFound(decision.ticketId, openViews, trace);
      const complement = decision.complement?.trim() || decision.summary;
      const { ticket } = focus;
      if (OPEN_STATUSES.includes(ticket.status)) {
        const draft = draftForExisting(ticket, "update", complement, now);
        trace.record({
          tool: "montar_rascunho",
          label: "montou o rascunho",
          status: "ok",
          detail: `complemento do ${ticket.id}`,
        });
        return {
          parts: [
            text(`Vou adicionar esta informação ao ${ticket.id}. Confira antes de eu enviar:`),
            { type: "draft_card", draft, state: "pendente" },
          ],
          transfer: null,
        };
      }
      if (canReopen(ticket, now)) {
        trace.rule(`O ${ticket.id} foi resolvido há até 7 dias: pode ser reaberto.`);
        const draft = draftForExisting(ticket, "reopen", complement, now);
        trace.record({
          tool: "montar_rascunho",
          label: "montou o rascunho",
          status: "ok",
          detail: `reabertura do ${ticket.id}`,
        });
        return {
          parts: [
            text(
              `O ${ticket.id} foi resolvido há ${plural(daysSince(ticket.resolvedAt ?? ticket.updatedAt, now), "dia", "dias")}. Posso reabri-lo com esta informação. Confira:`,
            ),
            { type: "draft_card", draft, state: "pendente" },
          ],
          transfer: null,
        };
      }
      trace.rule("Chamados resolvidos há mais de 7 dias não são reabertos.");
      return {
        parts: [
          text(
            `O ${ticket.id} já foi encerrado há mais de 7 dias e não pode ser reaberto. Quer que eu abra um chamado novo?`,
          ),
          {
            type: "quick_replies",
            question: null,
            options: [
              { label: "Abrir chamado novo", value: "Sim, abra um chamado novo." },
              { label: "Não", value: "Não, obrigado." },
            ],
          },
        ],
        transfer: null,
      };
    }

    case "propor_chamado":
      return proposeTicket(decision, context, trace);
  }
}

function ticketNotFound(
  ticketId: string | null,
  openViews: TicketView[],
  trace: TraceRecorder,
): PolicyOutcome {
  trace.rule("Privacidade: só os chamados do próprio funcionário são consultados.");
  const intro = ticketId
    ? `Não encontrei o ${ticketId} entre os seus chamados.`
    : "Não consegui identificar de qual chamado você está falando.";
  if (openViews.length === 0) {
    return { parts: [text(`${intro} Você não tem chamados abertos no momento.`)], transfer: null };
  }
  return {
    parts: [
      text(`${intro} Estes são os seus chamados abertos:`),
      { type: "ticket_select", tickets: openViews },
    ],
    transfer: null,
  };
}

function showTicket(
  view: TicketView,
  decision: TurnDecision,
  context: TurnContext,
  trace: TraceRecorder,
): PolicyOutcome {
  const { ticket, sla } = view;
  trace.record({
    tool: "calcular_prazo",
    label: "calculou o prazo",
    status: "ok",
    detail: sla.overdue
      ? `${ticket.id} vencido: prazo de ${sla.label} para prioridade ${ticket.priority}`
      : `${ticket.id} dentro do prazo de ${sla.label}`,
  });
  const card: MessagePart = { type: "ticket_card", view };

  // Chamado vencido: oferece um analista (o funcionário decide), como no protótipo.
  if (sla.overdue) {
    trace.rule("Chamado vencido: oferecer um analista.");
    const days = daysSince(ticket.updatedAt, context.now);
    return {
      parts: [
        card,
        text(
          `Está sem atualização há ${plural(days, "dia", "dias")}, acima do prazo de ${sla.label} para prioridade ${ticket.priority.toLowerCase()}. Quer que eu chame um analista?`,
        ),
        { type: "quick_replies", question: null, options: OVERDUE_OPTIONS },
      ],
      transfer: null,
    };
  }
  const due = sla.dueAt
    ? ` A próxima atualização está prevista até ${formatDue(new Date(sla.dueAt), context.now)}.`
    : "";
  return { parts: [card, text(`${decision.reply}${due}`.trim())], transfer: null };
}

function proposeTicket(
  decision: TurnDecision,
  context: TurnContext,
  trace: TraceRecorder,
): PolicyOutcome {
  const facts = decision.draft;
  const { now, employee } = context;

  const askAffected = (): PolicyOutcome => {
    trace.rule("Falta informação para abrir o chamado: quem é afetado.");
    return {
      parts: [
        text(decision.reply || "Vou abrir um chamado para você."),
        { type: "quick_replies", question: "Quem está sendo afetado?", options: AFFECTED_OPTIONS },
      ],
      transfer: null,
    };
  };
  if (!facts) return askAffected();

  // Duplicidade primeiro: atualizar ou reabrir em vez de criar outro. Para isso não importa
  // quem é afetado, então a pergunta só vem se for mesmo um chamado novo.
  const duplicate = findDuplicate(
    {
      title: facts.title,
      description: facts.description,
      category: facts.category,
      requesterId: employee.id,
    },
    (context.tickets ?? []).map((v) => v.ticket),
    now,
  );
  trace.record({
    tool: "verificar_duplicidade",
    label: "verificou duplicidade",
    status: "ok",
    detail: duplicate.reason,
  });
  if (duplicate.action !== "create") {
    trace.rule(`Sem duplicidade: ${duplicate.reason}`);
    const existing = context.tickets?.find((v) => v.ticket.id === duplicate.ticketId)?.ticket;
    if (existing) {
      const draft = draftForExisting(existing, duplicate.action, facts.description, now);
      trace.record({
        tool: "montar_rascunho",
        label: "montou o rascunho",
        status: "ok",
        detail: `${duplicate.action === "update" ? "complemento" : "reabertura"} do ${existing.id}`,
      });
      const message =
        duplicate.action === "update"
          ? `Você já tem o ${existing.id} aberto sobre isso. Em vez de abrir outro, posso adicionar estas informações a ele. Confira:`
          : `O ${existing.id} sobre isso foi resolvido há poucos dias. Posso reabri-lo com estas informações. Confira:`;
      return {
        parts: [text(message), { type: "draft_card", draft, state: "pendente" }],
        transfer: null,
      };
    }
  }

  // Abertura exige saber quem é afetado: sem isso não há como definir a prioridade.
  if (facts.affected === null) return askAffected();

  // Prioridade e prazo pelas regras do Anexo A.
  const { priority, reason } = classifyPriority({
    type: facts.type,
    affected: facts.affected,
    workBlocked: facts.workBlocked,
    sameDayCommitment: facts.sameDayCommitment,
  });
  trace.record({
    tool: "classificar_prioridade",
    label: "classificou a prioridade",
    status: "ok",
    detail: `${priority}: ${reason}`,
  });
  trace.rule(`Prioridade ${priority}: ${reason}`);

  const sla = draftSla(priority, now);
  trace.record({
    tool: "calcular_prazo",
    label: "consultou o SLA",
    status: "ok",
    detail: `${SLA_POLICIES[priority].label} → até ${formatDue(new Date(sla.dueAt ?? now), now)}`,
  });

  const draft: TicketDraft = {
    id: newDraftId(),
    action: "create",
    targetTicketId: null,
    type: facts.type,
    title: facts.title.slice(0, 120),
    description: facts.description,
    category: facts.category,
    priority,
    priorityReason: reason,
    affected: facts.affected,
    sla,
  };
  trace.record({
    tool: "montar_rascunho",
    label: "montou o rascunho",
    status: "ok",
    detail: draft.id,
  });
  trace.rule("O chamado só é criado depois da confirmação do funcionário.");

  const due = formatDue(new Date(sla.dueAt ?? now), now);
  const critical =
    priority === "Crítica"
      ? " Por ser crítico, um analista será chamado assim que você confirmar."
      : "";
  return {
    parts: [
      text(
        `Classifiquei com prioridade ${priority.toLowerCase()}: ${reason.charAt(0).toLowerCase()}${reason.slice(1, -1)}. A primeira resposta chega até ${due}.${critical} Confira antes de eu criar:`,
      ),
      { type: "draft_card", draft, state: "pendente" },
    ],
    transfer: null,
  };
}
