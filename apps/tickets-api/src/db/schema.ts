import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  AffectedScope,
  EmployeeRole,
  SupportLevel,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketType,
  TicketUpdateKind,
} from "@nexo/shared";

// Datas guardadas como texto ISO 8601 (UTC), que o SQLite ordena corretamente.

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  department: text("department").notNull(),
  role: text("role").$type<EmployeeRole>().notNull(),
  supportLevel: text("support_level").$type<SupportLevel>(),
});

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  type: text("type").$type<TicketType>().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").$type<TicketCategory>().notNull(),
  priority: text("priority").$type<TicketPriority>().notNull(),
  status: text("status").$type<TicketStatus>().notNull(),
  affected: text("affected").$type<AffectedScope>().notNull(),
  requesterId: text("requester_id")
    .notNull()
    .references(() => employees.id),
  supportLevel: text("support_level").$type<SupportLevel>(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const ticketUpdates = sqliteTable("ticket_updates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: text("ticket_id")
    .notNull()
    .references(() => tickets.id),
  kind: text("kind").$type<TicketUpdateKind>().notNull(),
  authorId: text("author_id").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

export const kbArticles = sqliteTable("kb_articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** Tags separadas por vírgula. */
  tags: text("tags").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Sequência dos números de chamado (INC-20xxx, REQ-10xxx). */
export const counters = sqliteTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull(),
});

/** Respostas já enviadas por chave de idempotência; torna os retries seguros. */
export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  status: integer("status").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});
