import { z } from "zod";
import { AffectedScope, Ticket, TicketCategory, TicketPriority, TicketType } from "./vocabulary";

// Conversa entre funcionário, agent e analista.

/** Com quem a conversa está. O agent só responde em "agente". */
export const CONVERSATION_STATUSES = [
  "agente",
  "aguardando_analista",
  "com_analista",
  "encerrada",
] as const;
export const ConversationStatus = z.enum(CONVERSATION_STATUSES);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const MessageRole = z.enum(["funcionario", "agent", "analista", "sistema"]);
export type MessageRole = z.infer<typeof MessageRole>;

export const SlaInfo = z.object({
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  overdue: z.boolean(),
  label: z.string(),
});
export type SlaInfo = z.infer<typeof SlaInfo>;

export const TicketView = z.object({ ticket: Ticket, sla: SlaInfo });
export type TicketView = z.infer<typeof TicketView>;

export const TicketDraft = z.object({
  id: z.string(),
  /** Criar um novo, complementar um aberto ou reabrir um resolvido há até 7 dias. */
  action: z.enum(["create", "update", "reopen"]),
  targetTicketId: z.string().nullable(),
  type: TicketType,
  title: z.string(),
  description: z.string(),
  category: TicketCategory,
  priority: TicketPriority,
  priorityReason: z.string(),
  affected: AffectedScope,
  sla: SlaInfo,
});
export type TicketDraft = z.infer<typeof TicketDraft>;

/** Partes tipadas de uma mensagem; cada uma vira um componente do protótipo. */
export const MessagePart = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("quick_replies"),
    question: z.string().nullable(),
    options: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  z.object({ type: z.literal("ticket_select"), tickets: z.array(TicketView) }),
  z.object({ type: z.literal("ticket_card"), view: TicketView }),
  z.object({
    type: z.literal("draft_card"),
    draft: TicketDraft,
    state: z.enum(["pendente", "confirmado", "cancelado"]),
  }),
  z.object({ type: z.literal("system_event"), text: z.string() }),
]);
export type MessagePart = z.infer<typeof MessagePart>;

/**
 * O que o agent entendeu e fez em um turno. Alimenta os chips "✓ consultou seus chamados"
 * acima da resposta, o painel de detalhes e o console do analista.
 */
export const DecisionTrace = z.object({
  understood: z.object({
    intent: z.string(),
    summary: z.string(),
    entities: z.record(z.string(), z.string()),
  }),
  actions: z.array(
    z.object({
      tool: z.string(),
      /** Texto curto do chip, ex.: "consultou seus chamados". */
      label: z.string(),
      status: z.enum(["ok", "erro"]),
      detail: z.string().nullable(),
      attempts: z.number().int().positive(),
    }),
  ),
  rulesApplied: z.array(z.string()),
  /** Confiança do agent na interpretação, de 0 a 1. */
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  model: z.string().nullable(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
  latencyMs: z.number(),
});
export type DecisionTrace = z.infer<typeof DecisionTrace>;
