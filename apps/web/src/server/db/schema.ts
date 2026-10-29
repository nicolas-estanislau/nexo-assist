import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ConversationStatus, DecisionTrace, MessagePart, MessageRole } from "@nexo/shared";

// Banco do app: conversas e o que o agent decidiu em cada turno. Os chamados ficam no
// tickets-api; aqui guardamos só referências a eles dentro das mensagens.

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  status: text("status").$type<ConversationStatus>().notNull(),
  /** Analista que assumiu (ou assumiu por último). */
  assignedAnalystId: text("assigned_analyst_id"),
  /** Por que foi para um analista e o resumo que ele recebe. */
  handoffReason: text("handoff_reason"),
  handoffSummary: text("handoff_summary"),
  handoffConfidence: real("handoff_confidence"),
  /** Chamado em foco quando foi transferida, para o painel do console. */
  handoffTicketId: text("handoff_ticket_id"),
  employeeMessageCount: integer("employee_message_count").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  closedAt: text("closed_at"),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role").$type<MessageRole>().notNull(),
  authorId: text("author_id"),
  parts: text("parts", { mode: "json" }).$type<MessagePart[]>().notNull(),
  trace: text("trace", { mode: "json" }).$type<DecisionTrace>(),
  createdAt: text("created_at").notNull(),
});

/** Histórico de quem esteve com a conversa (agent, fila, analista). */
export const conversationEvents = sqliteTable("conversation_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  fromStatus: text("from_status").$type<ConversationStatus>().notNull(),
  toStatus: text("to_status").$type<ConversationStatus>().notNull(),
  actorId: text("actor_id").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull(),
});
