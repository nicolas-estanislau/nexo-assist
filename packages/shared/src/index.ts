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
