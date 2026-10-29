import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { canReopen } from "@nexo/domain";
import {
  OPEN_STATUSES,
  type AddUpdateInput,
  type AnalystUpdateInput,
  type CreateTicketInput,
  type Employee,
  type ReopenInput,
  type Ticket,
  type TicketType,
  type TicketUpdate,
  type TicketUpdateKind,
  type TicketWithUpdates,
  type TransferTicketInput,
} from "@nexo/shared";
import type { Db } from "../db/client";
import { counters, ticketUpdates, tickets } from "../db/schema";
import { ApiError, ticketNotFound } from "../errors";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Primeiro número de cada sequência, caso o contador ainda não exista. */
const COUNTER_START: Record<TicketType, number> = { INC: 20600, REQ: 10500 };

function canView(actor: Employee, ticket: Ticket): boolean {
  return actor.role === "analista" || ticket.requesterId === actor.id;
}

async function loadVisible(db: Db | Tx, actor: Employee, id: string): Promise<Ticket> {
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
  if (!ticket || !canView(actor, ticket)) throw ticketNotFound(id);
  return ticket;
}

async function addHistory(
  tx: Db | Tx,
  ticketId: string,
  kind: TicketUpdateKind,
  authorId: string,
  message: string,
  at: Date,
): Promise<void> {
  await tx.insert(ticketUpdates).values({
    ticketId,
    kind,
    authorId,
    message,
    createdAt: at.toISOString(),
  });
}

export async function listTickets(
  db: Db,
  actor: Employee,
  requesterId: string,
  scope: "open" | "all",
): Promise<Ticket[]> {
  // Funcionário só lista os próprios chamados, seja qual for o requesterId pedido.
  if (actor.role !== "analista" && requesterId !== actor.id) {
    throw new ApiError("FORBIDDEN", "Você só pode consultar os seus chamados.");
  }
  const where =
    scope === "open"
      ? and(eq(tickets.requesterId, requesterId), inArray(tickets.status, [...OPEN_STATUSES]))
      : eq(tickets.requesterId, requesterId);
  return db.query.tickets.findMany({ where, orderBy: desc(tickets.updatedAt) });
}

export async function getTicket(db: Db, actor: Employee, id: string): Promise<TicketWithUpdates> {
  const ticket = await loadVisible(db, actor, id);
  const updates: TicketUpdate[] = await db.query.ticketUpdates.findMany({
    where: eq(ticketUpdates.ticketId, id),
    orderBy: asc(ticketUpdates.id),
  });
  return { ticket, updates };
}

export async function createTicket(
  db: Db,
  actor: Employee,
  input: CreateTicketInput,
  now: Date,
): Promise<Ticket> {
  return db.transaction(async (tx) => {
    const counter = await tx.query.counters.findFirst({ where: eq(counters.name, input.type) });
    const next = (counter?.value ?? COUNTER_START[input.type] - 1) + 1;
    await tx
      .insert(counters)
      .values({ name: input.type, value: next })
      .onConflictDoUpdate({ target: counters.name, set: { value: next } });

    const at = now.toISOString();
    const ticket: Ticket = {
      id: `${input.type}-${next}`,
      ...input,
      status: "Aberto",
      requesterId: actor.id,
      supportLevel: null,
      createdAt: at,
      updatedAt: at,
      resolvedAt: null,
    };
    await tx.insert(tickets).values(ticket);
    await addHistory(tx, ticket.id, "criacao", actor.id, "Chamado aberto pelo Nexo Assist.", now);
    return ticket;
  });
}

/** Funcionário complementa o chamado. Não reinicia o prazo: o prazo mede a resposta do service desk. */
export async function addUpdate(
  db: Db,
  actor: Employee,
  id: string,
  input: AddUpdateInput,
  now: Date,
): Promise<TicketWithUpdates> {
  const ticket = await loadVisible(db, actor, id);
  if (!OPEN_STATUSES.includes(ticket.status)) {
    throw new ApiError(
      "CONFLICT",
      `O ${id} está ${ticket.status.toLowerCase()}; reabra antes de atualizar.`,
    );
  }
  await addHistory(db, id, "comentario", actor.id, input.message, now);
  return getTicket(db, actor, id);
}

export async function reopenTicket(
  db: Db,
  actor: Employee,
  id: string,
  input: ReopenInput,
  now: Date,
): Promise<TicketWithUpdates> {
  const ticket = await loadVisible(db, actor, id);
  if (!canReopen(ticket, now)) {
    throw new ApiError(
      "CONFLICT",
      `O ${id} não pode ser reaberto: só chamados resolvidos há até 7 dias.`,
    );
  }
  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({ status: "Aberto", resolvedAt: null, updatedAt: now.toISOString() })
      .where(eq(tickets.id, id));
    await addHistory(tx, id, "reabertura", actor.id, input.reason, now);
  });
  return getTicket(db, actor, id);
}

export async function transferTicket(
  db: Db,
  actor: Employee,
  id: string,
  input: TransferTicketInput,
  now: Date,
): Promise<TicketWithUpdates> {
  const ticket = await loadVisible(db, actor, id);
  if (!OPEN_STATUSES.includes(ticket.status)) {
    throw new ApiError("CONFLICT", `O ${id} não está em aberto.`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({
        status: "Aguardando analista",
        supportLevel: input.level,
        updatedAt: now.toISOString(),
      })
      .where(eq(tickets.id, id));
    await addHistory(
      tx,
      id,
      "transferencia",
      actor.id,
      `Encaminhado para o Suporte ${input.level}. ${input.summary}`,
      now,
    );
  });
  return getTicket(db, actor, id);
}

export async function analystUpdate(
  db: Db,
  actor: Employee,
  id: string,
  input: AnalystUpdateInput,
  now: Date,
): Promise<TicketWithUpdates> {
  if (actor.role !== "analista") {
    throw new ApiError("FORBIDDEN", "Apenas analistas podem alterar status e prioridade.");
  }
  const ticket = await loadVisible(db, actor, id);
  await db.transaction(async (tx) => {
    const at = now.toISOString();
    const status = input.status ?? ticket.status;
    await tx
      .update(tickets)
      .set({
        status,
        priority: input.priority ?? ticket.priority,
        updatedAt: at,
        resolvedAt:
          status === "Resolvido" ? at : status === ticket.status ? ticket.resolvedAt : null,
      })
      .where(eq(tickets.id, id));

    const changes = [
      input.status && input.status !== ticket.status ? `Status: ${input.status}.` : null,
      input.priority && input.priority !== ticket.priority
        ? `Prioridade: ${input.priority}.`
        : null,
      input.message ?? null,
    ].filter((c): c is string => c !== null);
    const kind: TicketUpdateKind = input.status || input.priority ? "status" : "comentario";
    await addHistory(tx, id, kind, actor.id, changes.join(" ") || "Atualizado.", now);
  });
  return getTicket(db, actor, id);
}
