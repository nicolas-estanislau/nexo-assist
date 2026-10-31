import { and, asc, desc, eq, gt, gte, inArray, ne, or, sql } from "drizzle-orm";
import { transition, type ConversationEvent } from "@nexo/domain";
import type { DecisionTrace, MessagePart, MessageRole } from "@nexo/shared";
import type { AppDb } from "./db/client";
import { conversationEvents, conversationReads, conversations, messages } from "./db/schema";

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

/** Última conversa do funcionário, encerrada ou não. */
export async function findLatestConversation(
  db: AppDb,
  employeeId: string,
): Promise<Conversation | null> {
  const row = await db.query.conversations.findFirst({
    where: eq(conversations.employeeId, employeeId),
    orderBy: [desc(conversations.createdAt), desc(sql`rowid`)],
  });
  return row ?? null;
}

/**
 * Conversas do console: as em andamento e as encerradas desde `closedSince`. Conversas sem
 * nenhuma mensagem do funcionário (só a saudação) ficam de fora.
 */
export async function listConsoleConversations(
  db: AppDb,
  closedSince: Date,
): Promise<Conversation[]> {
  return db.query.conversations.findMany({
    where: and(
      gt(conversations.employeeMessageCount, 0),
      or(
        ne(conversations.status, "encerrada"),
        gte(conversations.closedAt, closedSince.toISOString()),
      ),
    ),
    orderBy: desc(conversations.updatedAt),
    limit: 200,
  });
}

export async function lastMessage(db: AppDb, conversationId: string): Promise<Message | null> {
  const row = await db.query.messages.findFirst({
    where: eq(messages.conversationId, conversationId),
    orderBy: [desc(messages.createdAt), desc(sql`rowid`)],
  });
  return row ?? null;
}

/**
 * Respostas do agent (cada uma é uma chamada ao LLM) desde `since`, de todos ou de um
 * funcionário. Base do limite de uso diário.
 */
export async function countAgentTurns(
  db: AppDb,
  since: Date,
  employeeId?: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(messages.role, "agent"),
        sql`${messages.trace} is not null`,
        gte(messages.createdAt, since.toISOString()),
        employeeId ? eq(conversations.employeeId, employeeId) : undefined,
      ),
    );
  return row?.count ?? 0;
}

/** Registra que o analista viu a conversa até agora. */
export async function markRead(
  db: AppDb,
  conversationId: string,
  analystId: string,
  now: Date,
): Promise<void> {
  const readAt = now.toISOString();
  await db
    .insert(conversationReads)
    .values({ conversationId, analystId, readAt })
    .onConflictDoUpdate({
      target: [conversationReads.conversationId, conversationReads.analystId],
      set: { readAt },
    });
}

/**
 * Mensagens do funcionário que o analista ainda não viu, por conversa. Conversa que ele nunca
 * abriu conta todas.
 */
export async function unreadCounts(
  db: AppDb,
  analystId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await db
    .select({ conversationId: messages.conversationId, count: sql<number>`count(*)` })
    .from(messages)
    .leftJoin(
      conversationReads,
      and(
        eq(conversationReads.conversationId, messages.conversationId),
        eq(conversationReads.analystId, analystId),
      ),
    )
    .where(
      and(
        inArray(messages.conversationId, conversationIds),
        eq(messages.role, "funcionario"),
        or(
          sql`${conversationReads.readAt} is null`,
          gt(messages.createdAt, conversationReads.readAt),
        ),
      ),
    )
    .groupBy(messages.conversationId);
  return new Map(rows.map((r) => [r.conversationId, r.count]));
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
    handoffLevel: null,
    handoffAt: null,
    employeeMessageCount: 0,
    createdAt: at,
    updatedAt: at,
    closedAt: null,
    closedBy: null,
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

/**
 * Troca as partes de uma mensagem só se ainda estiverem como lidas (compare-and-swap).
 * É o que impede um duplo clique em "Confirmar" de criar dois chamados.
 */
export async function replaceMessageParts(
  db: AppDb,
  messageId: string,
  expected: MessagePart[],
  next: MessagePart[],
): Promise<boolean> {
  const updated = await db
    .update(messages)
    .set({ parts: next })
    .where(and(eq(messages.id, messageId), eq(messages.parts, expected)))
    .returning({ id: messages.id });
  return updated.length > 0;
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
      | "handoffLevel"
      | "handoffAt"
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
      closedBy: result.status === "encerrada" ? input.actorId : current.closedBy,
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
