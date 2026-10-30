import type { DecisionTrace, MessagePart, TicketDraft } from "@nexo/shared";
import { createTicketsClient, type TicketsClientOptions } from "@nexo/tickets-client";
import { loadContext, type Employee } from "./context";
import type { TurnDecision } from "./decision";
import type { Interpreter } from "./interpreter";
import { applyPolicy, type TransferOutcome } from "./policy";
import { buildPrompt, partsToText, type HistoryMessage } from "./prompt";
import { TraceRecorder, type AgentEvent } from "./trace";

// Um turno do agent:
//   1. carrega o contexto (chamados do funcionário + central de ajuda), sem LLM;
//   2. uma chamada ao LLM interpreta a mensagem e sugere uma ação;
//   3. a política aplica as regras do service desk e decide o que acontece;
//   4. o trace registra o que foi entendido, feito, com que confiança e por quê.

export type TicketsConnection = Omit<TicketsClientOptions, "onRetry">;

export interface RunTurnInput {
  employee: Employee;
  message: string;
  history: readonly HistoryMessage[];
  pendingDraft: TicketDraft | null;
  tickets: TicketsConnection;
  interpreter: Interpreter;
  now?: Date;
  onEvent?: (event: AgentEvent) => void;
}

export interface TurnResult {
  parts: MessagePart[];
  trace: DecisionTrace;
  transfer: TransferOutcome | null;
}

/** Mensagens curtas ("Só eu", "Sim") não dizem nada à busca; junta com a anterior do funcionário. */
function kbQueryFor(message: string, history: readonly HistoryMessage[]): string {
  if (message.split(/\s+/).length >= 4) return message;
  const previous = [...history].reverse().find((m) => m.role === "funcionario");
  return previous ? `${partsToText(previous.parts)} ${message}` : message;
}

function entitiesOf(decision: TurnDecision): Record<string, string> {
  const entities: Record<string, string> = {};
  if (decision.ticketId) entities["chamado"] = decision.ticketId;
  if (decision.articleId) entities["artigo"] = decision.articleId;
  if (decision.draft) {
    entities["tipo"] = decision.draft.type;
    entities["categoria"] = decision.draft.category;
    entities["afetados"] = decision.draft.affected ?? "não informado";
    entities["impede de trabalhar"] = decision.draft.workBlocked ? "sim" : "não";
    entities["compromisso hoje"] = decision.draft.sameDayCommitment ? "sim" : "não";
  }
  if (decision.complement) entities["complemento"] = decision.complement;
  return entities;
}

export async function runTurn(input: RunTurnInput): Promise<TurnResult> {
  const started = Date.now();
  const now = input.now ?? new Date();
  const trace = new TraceRecorder(input.onEvent);
  const client = createTicketsClient({ ...input.tickets, onRetry: trace.onRetry });
  const tickets = client.as(input.employee.id);

  const context = await loadContext({
    now,
    employee: input.employee,
    tickets,
    kb: client,
    kbQuery: kbQueryFor(input.message, input.history),
    pendingDraft: input.pendingDraft,
    trace,
  });

  trace.thinking();
  let interpretation;
  try {
    interpretation = await input.interpreter.interpret(
      buildPrompt(context, input.history, input.message),
    );
  } catch (err) {
    // Falha do modelo: avisa e não age. Não transfere sozinho para não lotar a fila por instabilidade.
    return {
      parts: [
        {
          type: "text",
          text: "Tive um problema para processar sua mensagem agora. Pode enviar de novo?",
        },
      ],
      transfer: null,
      trace: {
        understood: {
          intent: "desconhecida",
          summary: "Não foi possível interpretar.",
          entities: {},
        },
        actions: [
          ...trace.actions,
          {
            tool: "interpretar",
            label: "não conseguiu interpretar",
            status: "erro",
            detail: err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido",
            attempts: 1,
          },
        ],
        rulesApplied: ["Falha do modelo: nenhuma ação tomada."],
        confidence: 0,
        rationale: "O modelo não respondeu; nada foi feito.",
        model: null,
        usage: null,
        latencyMs: Date.now() - started,
      },
    };
  }

  const { decision } = interpretation;
  const article = context.kb.find((r) => r.article.id === decision.articleId)?.article;
  if (article) trace.rule(`Central de ajuda: ${article.id} "${article.title}".`);

  const outcome = applyPolicy(decision, context, trace);

  if (outcome.transfer) {
    const { transfer } = outcome;
    const focus = context.tickets?.find((v) => v.ticket.id === transfer.ticketId);
    if (focus) {
      await trace
        .call(
          "transferir_chamado",
          `encaminhou o ${focus.ticket.id} ao Suporte ${transfer.level}`,
          () =>
            tickets.transferTicket(focus.ticket.id, {
              level: transfer.level,
              summary: transfer.summary,
            }),
        )
        .catch(() => {
          // A conversa vai para o analista mesmo se o sistema de chamados falhar agora.
        });
    }
    trace.record({
      tool: "transferir_conversa",
      label: "chamou um analista",
      status: "ok",
      detail: transfer.reason,
    });
  }

  return {
    parts: outcome.parts,
    transfer: outcome.transfer,
    trace: {
      understood: {
        intent: decision.intent,
        summary: decision.summary,
        entities: entitiesOf(decision),
      },
      actions: trace.actions,
      rulesApplied: trace.rules,
      confidence: decision.confidence,
      rationale: decision.rationale,
      model: interpretation.model,
      usage: interpretation.usage,
      latencyMs: Date.now() - started,
    },
  };
}
