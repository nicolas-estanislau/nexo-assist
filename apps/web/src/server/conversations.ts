import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { transition, type ConversationEvent } from "@nexo/domain";
import type { DecisionTrace, MessagePart, MessageRole } from "@nexo/shared";
import type { AppDb } from "./db/client";
import { conversationEvents, conversations, messages } from "./db/schema";

// Repositório das conversas. Sem "server-only" para poder ser testado direto com Vitest;
// quem chama (páginas, ações, rotas) já garante a sessão.

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

export class ConversationError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID_TRANSITION" | "CONFLICT",
  ) {
    super(message);
    this.name = "ConversationError";
  }
}

/** Conversa em andamento do funcionário (para "voltar outro dia e continuar de onde parei"). */
export async function findActiveConversation(
  db: AppDb,
  employeeId: string,
): Promise<Conversation | null> {
  const row = await db.query.conversations.findFirst({
    where: and(eq(conversations.employeeId, employeeId), ne(conversations.status, "encerrada")),
    orderBy: desc(conversations.updatedAt),
  });
  return row ?? null;
}

export async function startConversation(
  db: AppDb,
  employeeId: string,
  now: Date,
): Promise<Conversation> {
  const at = now.toISOString();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    employeeId,
    status: "agente",
    assignedAnalystId: null,
    handoffReason: null,
    handoffSummary: null,
    handoffConfidence: null,
    handoffTicketId: null,
    employeeMessageCount: 0,
    createdAt: at,
    updatedAt: at,
    closedAt: null,
  };
  await db.insert(conversations).values(conversation);
  return conversation;
}

export async function getConversation(db: AppDb, id: string): Promise<Conversation> {
  const row = await db.query.conversations.findFirst({ where: eq(conversations.id, id) });
  if (!row) throw new ConversationError("Conversa não encontrada.", "NOT_FOUND");
  return row;
}

export async function listMessages(db: AppDb, conversationId: string): Promise<Message[]> {
  return db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    // rowid desempata mensagens gravadas no mesmo milissegundo.
    orderBy: [asc(messages.createdAt), asc(sql`rowid`)],
  });
}

export interface NewMessage {
  role: MessageRole;
  authorId: string | null;
  parts: MessagePart[];
  trace?: DecisionTrace;
}

export async function appendMessage(
  db: AppDb,
  conversationId: string,
  input: NewMessage,
  now: Date,
): Promise<Message> {
  const message: Message = {
    id: crypto.randomUUID(),
    conversationId,
    role: input.role,
    authorId: input.authorId,
    parts: input.parts,
    trace: input.trace ?? null,
    createdAt: now.toISOString(),
  };
  await db.batch([
    db.insert(messages).values(message),
    db
      .update(conversations)
      .set({
        updatedAt: message.createdAt,
        employeeMessageCount:
          input.role === "funcionario"
            ? sql`${conversations.employeeMessageCount} + 1`
            : conversations.employeeMessageCount,
      })
      .where(eq(conversations.id, conversationId)),
  ]);
  return message;
}

export interface TransitionInput {
  event: ConversationEvent;
  actorId: string;
  note?: string;
  /** Campos extras gravados junto com a mudança de estado. */
  patch?: Partial<
    Pick<
      Conversation,
      | "assignedAnalystId"
      | "handoffReason"
      | "handoffSummary"
      | "handoffConfidence"
      | "handoffTicketId"
    >
  >;
}

/**
 * Muda com quem está a conversa. A máquina de estados do domínio decide se a transição é
 * válida; o UPDATE condicionado ao estado lido evita corrida (dois analistas assumindo juntos).
 */
export async function applyTransition(
  db: AppDb,
  conversationId: string,
  input: TransitionInput,
  now: Date,
): Promise<Conversation> {
  const current = await getConversation(db, conversationId);
  const result = transition(current.status, input.event);
  if (!result.ok) throw new ConversationError(result.error, "INVALID_TRANSITION");

  const at = now.toISOString();
  const updated = await db
    .update(conversations)
    .set({
      ...input.patch,
      status: result.status,
      updatedAt: at,
      closedAt: result.status === "encerrada" ? at : current.closedAt,
    })
    .where(and(eq(conversations.id, conversationId), eq(conversations.status, current.status)))
    .returning();
  if (updated.length === 0) {
    throw new ConversationError(
      "A conversa mudou enquanto você agia. Atualize e tente de novo.",
      "CONFLICT",
    );
  }

  await db.insert(conversationEvents).values({
    conversationId,
    fromStatus: current.status,
    toStatus: result.status,
    actorId: input.actorId,
    note: input.note ?? null,
    createdAt: at,
  });
  return updated[0] as Conversation;
}
