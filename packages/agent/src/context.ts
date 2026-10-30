import { canReopen, getSlaStatus } from "@nexo/domain";
import {
  OPEN_STATUSES,
  type KbSearchResult,
  type Ticket,
  type TicketDraft,
  type TicketView,
} from "@nexo/shared";
import type { ActorTicketsClient, TicketsClient } from "@nexo/tickets-client";
import type { TraceRecorder } from "./trace";

// Contexto carregado ANTES de chamar o LLM, sem custo de modelo: os chamados do funcionário e
// os artigos da central de ajuda ligados à mensagem. Assim a maioria dos turnos resolve com uma
// única chamada ao LLM, em vez de um vai-e-volta de ferramentas.

export interface Employee {
  id: string;
  name: string;
  department: string;
}

export interface TurnContext {
  now: Date;
  employee: Employee;
  /** Chamados abertos e resolvidos há até 7 dias. null = sistema de chamados indisponível. */
  tickets: TicketView[] | null;
  kb: KbSearchResult[];
  pendingDraft: TicketDraft | null;
}

export function toView(ticket: Ticket, now: Date): TicketView {
  const sla = getSlaStatus(ticket, now);
  return {
    ticket,
    sla: { dueAt: sla.dueAt?.toISOString() ?? null, overdue: sla.overdue, label: sla.label },
  };
}

export function isRelevant(ticket: Ticket, now: Date): boolean {
  return OPEN_STATUSES.includes(ticket.status) || canReopen(ticket, now);
}

export async function loadContext(input: {
  now: Date;
  employee: Employee;
  tickets: ActorTicketsClient;
  kb: Pick<TicketsClient, "searchKb">;
  kbQuery: string;
  pendingDraft: TicketDraft | null;
  trace: TraceRecorder;
}): Promise<TurnContext> {
  const { now, trace } = input;

  const [tickets, kb] = await Promise.all([
    trace
      .call(
        "listar_chamados",
        "consultou seus chamados",
        () => input.tickets.listTickets("all"),
        (all) => {
          const relevant = all.filter((t) => isRelevant(t, now));
          return `${relevant.length} chamado(s) em aberto ou reabríveis`;
        },
      )
      .then((all) => all.filter((t) => isRelevant(t, now)).map((t) => toView(t, now)))
      .catch(() => null),
    trace
      .call(
        "buscar_central_de_ajuda",
        "buscou na central de ajuda",
        () => input.kb.searchKb(input.kbQuery, 3),
        (results) =>
          results.length > 0
            ? results.map((r) => `${r.article.id} (${Math.round(r.score * 100)}%)`).join(", ")
            : "nenhum artigo relacionado",
      )
      .catch(() => []),
  ]);

  return { now, employee: input.employee, tickets, kb, pendingDraft: input.pendingDraft };
}
