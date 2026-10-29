import { z } from "zod";

// Vocabulário do service desk (PRD, Anexo A).

export const TICKET_TYPES = ["INC", "REQ"] as const;
export const TicketType = z.enum(TICKET_TYPES);
export type TicketType = z.infer<typeof TicketType>;

export const TICKET_CATEGORIES = [
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
] as const;
export const TicketCategory = z.enum(TICKET_CATEGORIES);
export type TicketCategory = z.infer<typeof TicketCategory>;

export const TICKET_PRIORITIES = ["Crítica", "Alta", "Média", "Baixa"] as const;
export const TicketPriority = z.enum(TICKET_PRIORITIES);
export type TicketPriority = z.infer<typeof TicketPriority>;

export const TICKET_STATUSES = [
  "Aberto",
  "Em andamento",
  "Aguardando analista",
  "Aguardando funcionário",
  "Aprovado",
  "Resolvido",
  "Cancelado",
] as const;
export const TicketStatus = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof TicketStatus>;

/** Status em que o chamado ainda está em aberto (pode ser atualizado em vez de duplicado). */
export const OPEN_STATUSES: readonly TicketStatus[] = [
  "Aberto",
  "Em andamento",
  "Aguardando analista",
  "Aguardando funcionário",
  "Aprovado",
];

/** Quem é afetado pelo problema; define o impacto na prioridade. */
export const AFFECTED_SCOPES = ["individual", "equipe", "empresa"] as const;
export const AffectedScope = z.enum(AFFECTED_SCOPES);
export type AffectedScope = z.infer<typeof AffectedScope>;

export const Ticket = z.object({
  id: z.string(),
  type: TicketType,
  title: z.string().min(1),
  description: z.string().min(1),
  category: TicketCategory,
  priority: TicketPriority,
  status: TicketStatus,
  affected: AffectedScope,
  requesterId: z.string(),
  createdAt: z.iso.datetime(),
  /** Última interação do service desk; base para o prazo da próxima atualização. */
  updatedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type Ticket = z.infer<typeof Ticket>;
