import { OPEN_STATUSES, type Ticket, type TicketPriority } from "@nexo/shared";
import { BUSINESS_MINUTES_PER_DAY, addBusinessMinutes } from "./business-hours";

// Prazos do Anexo A. Valem para a primeira resposta e para cada atualização.
// Chamados críticos contam em horas corridas (há plantão 24h); os demais, em expediente.

type SlaPolicy =
  | { clock: "corrido"; minutes: number; label: string }
  | { clock: "útil"; minutes: number; label: string };

export const SLA_POLICIES: Record<TicketPriority, SlaPolicy> = {
  Crítica: { clock: "corrido", minutes: 60, label: "1 hora" },
  Alta: { clock: "útil", minutes: 4 * 60, label: "4 horas úteis" },
  Média: { clock: "útil", minutes: 3 * BUSINESS_MINUTES_PER_DAY, label: "3 dias úteis" },
  Baixa: { clock: "útil", minutes: 5 * BUSINESS_MINUTES_PER_DAY, label: "5 dias úteis" },
};

export function computeDueAt(priority: TicketPriority, from: Date): Date {
  const policy = SLA_POLICIES[priority];
  return policy.clock === "corrido"
    ? new Date(from.getTime() + policy.minutes * 60 * 1000)
    : addBusinessMinutes(from, policy.minutes);
}

export interface SlaStatus {
  /** Prazo da próxima resposta, ou null se o chamado não está mais em aberto. */
  dueAt: Date | null;
  overdue: boolean;
  label: string;
}

export function getSlaStatus(
  ticket: Pick<Ticket, "priority" | "status" | "updatedAt">,
  now: Date,
): SlaStatus {
  const label = SLA_POLICIES[ticket.priority].label;
  if (!OPEN_STATUSES.includes(ticket.status)) {
    return { dueAt: null, overdue: false, label };
  }
  const dueAt = computeDueAt(ticket.priority, new Date(ticket.updatedAt));
  return { dueAt, overdue: now > dueAt, label };
}
