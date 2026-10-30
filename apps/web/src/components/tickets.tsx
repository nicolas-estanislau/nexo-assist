import {
  formatAgo,
  formatShortDateTime,
  type AffectedScope,
  type TicketPriority,
  type TicketStatus,
  type TicketView,
} from "@nexo/shared";

// Peças de chamado usadas no chat e no console do analista.

const STATUS_TONE: Record<TicketStatus, { dot: string; text: string }> = {
  Aberto: { dot: "bg-info", text: "text-info" },
  "Em andamento": { dot: "bg-info", text: "text-info" },
  "Em atendimento": { dot: "bg-info", text: "text-info" },
  "Aguardando analista": { dot: "bg-warn", text: "text-warn" },
  "Aguardando funcionário": { dot: "bg-warn", text: "text-warn" },
  Aprovado: { dot: "bg-ok", text: "text-ok" },
  Resolvido: { dot: "bg-ok", text: "text-ok" },
  Cancelado: { dot: "bg-slate-400", text: "text-muted" },
};

const PRIORITY_DOT: Record<TicketPriority, string> = {
  Crítica: "bg-danger",
  Alta: "bg-warn",
  Média: "bg-slate-400",
  Baixa: "bg-slate-300",
};

/** Quem é afetado, do ponto de vista de quem fala com o funcionário. */
export const AFFECTED_LABEL: Record<AffectedScope, string> = {
  individual: "Somente você",
  equipe: "Sua equipe",
  empresa: "A empresa toda",
};

export function StatusDot({
  status,
  className = "",
}: {
  status: TicketStatus;
  className?: string;
}) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${tone.text} ${className}`}
    >
      <span className={`size-1.5 rounded-full ${tone.dot}`} />
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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium">{children}</dd>
    </div>
  );
}

export function TicketCard({ view, now = new Date() }: { view: TicketView; now?: Date }) {
  const { ticket, sla } = view;
  return (
    <div className="w-full rounded-lg border border-line bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-muted">
          Chamado <span className="mx-1">·</span> {ticket.id}
        </span>
        <StatusDot status={ticket.status} className="text-[11px] font-medium" />
      </div>
      <p className="mt-1.5 text-[16px] font-semibold leading-snug">{ticket.title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{ticket.description}</p>
      <dl className="mt-3 grid grid-cols-4 gap-3 border-t border-line pt-3">
        <Field label="Categoria">{ticket.category}</Field>
        <Field label="Prioridade">
          <PriorityTag priority={ticket.priority} />
        </Field>
        <Field label="Aberto em">{formatShortDateTime(ticket.createdAt)}</Field>
        <Field label="Última atualização">
          {sla.overdue ? (
            <>
              <span className="text-warn">{formatAgo(ticket.updatedAt, now)}</span>
              <span className="font-normal text-muted"> · prazo vencido</span>
            </>
          ) : (
            formatAgo(ticket.updatedAt, now)
          )}
        </Field>
      </dl>
    </div>
  );
}
