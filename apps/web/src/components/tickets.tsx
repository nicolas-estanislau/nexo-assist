import { Clock } from "lucide-react";
import {
  daysSince,
  formatDue,
  plural,
  type AffectedScope,
  type TicketPriority,
  type TicketStatus,
  type TicketView,
} from "@nexo/shared";

// Peças de chamado usadas no chat e no console do analista.

const STATUS_TONE: Record<TicketStatus, string> = {
  Aberto: "bg-info/10 text-info",
  "Em andamento": "bg-info/10 text-info",
  "Em atendimento": "bg-info/10 text-info",
  "Aguardando analista": "bg-warn/10 text-warn",
  "Aguardando funcionário": "bg-warn/10 text-warn",
  Aprovado: "bg-ok/10 text-ok",
  Resolvido: "bg-ok/10 text-ok",
  Cancelado: "bg-slate-100 text-muted",
};

const PRIORITY_DOT: Record<TicketPriority, string> = {
  Crítica: "bg-danger",
  Alta: "bg-warn",
  Média: "bg-info",
  Baixa: "bg-slate-400",
};

export const AFFECTED_LABEL: Record<AffectedScope, string> = {
  individual: "Só a pessoa",
  equipe: "A equipe",
  empresa: "A empresa toda",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status]}`}>
      {status}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: TicketPriority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${PRIORITY_DOT[priority]}`} />
      {priority}
    </span>
  );
}

/** Texto do prazo: "até 13:43", "vencido" ou o motivo de não haver prazo. */
export function SlaText({ view, now = new Date() }: { view: TicketView; now?: Date }) {
  const { sla, ticket } = view;
  if (sla.overdue) {
    return (
      <span className="font-medium text-danger">
        Prazo vencido · sem atualização há {plural(daysSince(ticket.updatedAt, now), "dia", "dias")}
      </span>
    );
  }
  if (!sla.dueAt) return <span>{ticket.status === "Resolvido" ? "Resolvido" : "Sem prazo"}</span>;
  return <span>Próxima atualização até {formatDue(new Date(sla.dueAt), now)}</span>;
}

export function TicketCard({ view }: { view: TicketView }) {
  const { ticket, sla } = view;
  return (
    <div
      className={`w-full max-w-md rounded-xl border bg-white p-4 ${sla.overdue ? "border-danger/40" : "border-line"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">{ticket.id}</span>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="mt-1.5 text-[14px] font-medium leading-snug">{ticket.title}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        <span>{ticket.category}</span>·<PriorityTag priority={ticket.priority} />·
        <span>{sla.label}</span>
      </p>
      <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[12px] text-muted">
        <Clock className="size-3.5" />
        <SlaText view={view} />
      </p>
    </div>
  );
}
