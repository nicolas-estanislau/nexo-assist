import { z } from "zod";
import {
  AffectedScope,
  SupportLevel,
  Ticket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "./vocabulary";

// Contrato HTTP do serviço de chamados (apps/tickets-api), usado pelo cliente tipado.

export const EmployeeRole = z.enum(["funcionario", "analista"]);
export type EmployeeRole = z.infer<typeof EmployeeRole>;

export const Employee = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  department: z.string(),
  role: EmployeeRole,
  /** Só para analistas. */
  supportLevel: SupportLevel.nullable(),
});
export type Employee = z.infer<typeof Employee>;

export const TicketUpdateKind = z.enum([
  "criacao",
  "comentario",
  "status",
  "transferencia",
  "reabertura",
]);
export type TicketUpdateKind = z.infer<typeof TicketUpdateKind>;

export const TicketUpdate = z.object({
  id: z.number().int(),
  ticketId: z.string(),
  kind: TicketUpdateKind,
  authorId: z.string(),
  message: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type TicketUpdate = z.infer<typeof TicketUpdate>;

export const TicketWithUpdates = z.object({
  ticket: Ticket,
  updates: z.array(TicketUpdate),
});
export type TicketWithUpdates = z.infer<typeof TicketWithUpdates>;

export const KbArticle = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type KbArticle = z.infer<typeof KbArticle>;

export const KbSearchResult = z.object({
  article: KbArticle,
  score: z.number(),
});
export type KbSearchResult = z.infer<typeof KbSearchResult>;

// --- Corpos das requisições ---

export const CreateTicketInput = z.object({
  type: TicketType,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  category: TicketCategory,
  priority: TicketPriority,
  affected: AffectedScope,
});
export type CreateTicketInput = z.infer<typeof CreateTicketInput>;

export const AddUpdateInput = z.object({
  message: z.string().trim().min(1).max(4000),
});
export type AddUpdateInput = z.infer<typeof AddUpdateInput>;

export const ReopenInput = z.object({
  reason: z.string().trim().min(1).max(4000),
});
export type ReopenInput = z.infer<typeof ReopenInput>;

export const TransferTicketInput = z.object({
  level: SupportLevel,
  /** Resumo do caso para o analista não precisar perguntar tudo de novo. */
  summary: z.string().trim().min(1).max(4000),
});
export type TransferTicketInput = z.infer<typeof TransferTicketInput>;

export const AnalystUpdateInput = z
  .object({
    status: TicketStatus.optional(),
    priority: TicketPriority.optional(),
    message: z.string().trim().min(1).max(4000).optional(),
  })
  .refine((v) => v.status ?? v.priority ?? v.message, {
    message: "Informe ao menos status, prioridade ou mensagem.",
  });
export type AnalystUpdateInput = z.infer<typeof AnalystUpdateInput>;

// --- Erros ---

export const ApiErrorCode = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "UNAVAILABLE",
  "INTERNAL",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiErrorBody = z.object({
  error: z.object({ code: ApiErrorCode, message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
