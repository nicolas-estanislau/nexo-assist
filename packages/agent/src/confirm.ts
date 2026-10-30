import type { DecisionTrace, MessagePart, Ticket, TicketDraft } from "@nexo/shared";
import { createTicketsClient, TicketsApiError } from "@nexo/tickets-client";
import { toView, type Employee } from "./context";
import { supportLevelFor, type TransferOutcome } from "./policy";
import { TraceRecorder, type AgentEvent } from "./trace";
import type { TicketsConnection } from "./turn";

// Executa um rascunho confirmado pelo funcionário. Sem LLM: os dados são exatamente os que ele
// viu no card. O rascunho vem do banco do app (não do navegador), então não pode ser adulterado.

export interface ConfirmDraftInput {
  employee: Employee;
  draft: TicketDraft;
  tickets: TicketsConnection;
  now?: Date;
  onEvent?: (event: AgentEvent) => void;
}

export interface ConfirmDraftResult {
  ok: boolean;
  ticket: Ticket | null;
  parts: MessagePart[];
  trace: DecisionTrace;
  transfer: TransferOutcome | null;
}

export async function confirmDraft(input: ConfirmDraftInput): Promise<ConfirmDraftResult> {
  const started = Date.now();
  const now = input.now ?? new Date();
  const { draft } = input;
  const trace = new TraceRecorder(input.onEvent);
  const tickets = createTicketsClient({ ...input.tickets, onRetry: trace.onRetry }).as(
    input.employee.id,
  );

  const finish = (
    rest: Omit<ConfirmDraftResult, "trace">,
    rationale: string,
  ): ConfirmDraftResult => ({
    ...rest,
    trace: {
      understood: {
        intent: "confirmar_rascunho",
        summary: `Confirmou o rascunho ${draft.id}.`,
        entities: {
          rascunho: draft.id,
          ...(draft.targetTicketId ? { chamado: draft.targetTicketId } : {}),
        },
      },
      actions: trace.actions,
      rulesApplied: trace.rules,
      confidence: 1,
      rationale,
      model: null,
      usage: null,
      latencyMs: Date.now() - started,
    },
  });

  try {
    let ticket: Ticket;
    let message: string;
    if (draft.action === "create") {
      ticket = await trace.call(
        "criar_chamado",
        "criou o chamado",
        () =>
          tickets.createTicket({
            type: draft.type,
            title: draft.title,
            description: draft.description,
            category: draft.category,
            priority: draft.priority,
            affected: draft.affected,
          }),
        (t) => t.id,
      );
      message = `Pronto: abri o ${ticket.id} com prioridade ${ticket.priority.toLowerCase()}.`;
    } else {
      const target = draft.targetTicketId ?? "";
      const result =
        draft.action === "update"
          ? await trace.call("atualizar_chamado", `atualizou o ${target}`, () =>
              tickets.addUpdate(target, { message: draft.description }),
            )
          : await trace.call("reabrir_chamado", `reabriu o ${target}`, () =>
              tickets.reopenTicket(target, { reason: draft.description }),
            );
      ticket = result.ticket;
      message =
        draft.action === "update"
          ? `Pronto: adicionei a informação ao ${ticket.id}. O analista vai ver no histórico do chamado.`
          : `Pronto: reabri o ${ticket.id} com a nova informação.`;
    }

    // Caso crítico: o chamado já nasce com um analista chamado (Anexo A).
    let transfer: TransferOutcome | null = null;
    if (ticket.priority === "Crítica") {
      trace.rule("Transferência: caso crítico.");
      const level = supportLevelFor("Crítica", false);
      const summary = `${ticket.id} crítico: ${ticket.title}. ${ticket.description}`;
      await trace
        .call("transferir_chamado", `encaminhou o ${ticket.id} ao Suporte ${level}`, () =>
          tickets.transferTicket(ticket.id, { level, summary }),
        )
        .catch(() => {});
      trace.record({
        tool: "transferir_conversa",
        label: "chamou um analista",
        status: "ok",
        detail: "Caso crítico.",
      });
      transfer = { reason: "Caso crítico.", summary, confidence: 1, ticketId: ticket.id, level };
      message += ` Por ser crítico, já chamei o Suporte ${level}: um analista vai continuar por aqui.`;
    }

    return finish(
      {
        ok: true,
        ticket,
        parts: [
          { type: "text", text: message },
          { type: "ticket_card", view: toView(ticket, now) },
        ],
        transfer,
      },
      "O funcionário confirmou o rascunho; os dados enviados são os do card.",
    );
  } catch (err) {
    const temporary = err instanceof TicketsApiError && err.retryable;
    trace.rule(
      temporary
        ? "Sistema de chamados indisponível: rascunho mantido."
        : "O sistema de chamados recusou a operação.",
    );
    return finish(
      {
        ok: false,
        ticket: null,
        parts: [
          {
            type: "text",
            text: temporary
              ? "O sistema de chamados está instável e não consegui concluir agora. Seu rascunho continua aqui: tente confirmar de novo em alguns segundos."
              : `Não consegui concluir: ${err instanceof Error ? err.message : "erro desconhecido"}`,
          },
        ],
        transfer: null,
      },
      "Falha ao executar o rascunho confirmado.",
    );
  }
}
