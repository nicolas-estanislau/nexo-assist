import "server-only";
import { toView } from "@nexo/agent";
import { OPEN_STATUSES, type MessagePart } from "@nexo/shared";
import type { AnalystActionBody, ConsoleDetail, InboxItem, Person } from "@/lib/console";
import {
  appendMessage,
  applyTransition,
  getConversation,
  lastMessage,
  listConsoleConversations,
  listMessages,
  type Conversation,
} from "./conversations";
import { appDb } from "./db";
import type { SessionUser } from "./session-token";
import { ticketsClient } from "./tickets";

// O console do analista: lista de conversas, assumir, devolver, encerrar e responder.
// As mudanças de estado passam pela máquina do domínio (applyTransition), que também impede
// dois analistas de assumirem a mesma conversa.

export class ConsoleError extends Error {
  constructor(
    message: string,
    readonly code: "FORBIDDEN" | "INVALID",
  ) {
    super(message);
    this.name = "ConsoleError";
  }
}

/** Encerradas continuam na lista por um dia, para o analista ver o que foi resolvido. */
const CLOSED_WINDOW_MS = 24 * 60 * 60 * 1000;

// Nomes e departamentos vêm do cadastro do sistema de chamados e quase nunca mudam.
const people = new Map<string, Person>();

async function person(id: string): Promise<Person> {
  const cached = people.get(id);
  if (cached) return cached;
  try {
    const e = await ticketsClient().getEmployee(id);
    const found = {
      id: e.id,
      name: e.name,
      department: e.department,
      supportLevel: e.supportLevel,
    };
    people.set(id, found);
    return found;
  } catch {
    return { id, name: id, department: "", supportLevel: null };
  }
}

/** Resumo da última mensagem para a lista. */
function preview(parts: MessagePart[]): string {
  for (const part of parts) {
    switch (part.type) {
      case "text":
      case "system_event":
        return part.text;
      case "ticket_card":
        return `Chamado ${part.view.ticket.id}: ${part.view.ticket.status}`;
      case "draft_card":
        return `Rascunho: ${part.draft.title}`;
      case "ticket_select":
        return "Lista de chamados para escolher";
      case "quick_replies":
        if (part.question) return part.question;
    }
  }
  return "";
}

async function toItem(conversation: Conversation): Promise<InboxItem> {
  const db = await appDb();
  const [employee, analyst, last] = await Promise.all([
    person(conversation.employeeId),
    conversation.assignedAnalystId ? person(conversation.assignedAnalystId) : null,
    lastMessage(db, conversation.id),
  ]);
  return {
    id: conversation.id,
    status: conversation.status,
    employee,
    analyst,
    handoff: conversation.handoffReason
      ? {
          reason: conversation.handoffReason,
          summary: conversation.handoffSummary,
          confidence: conversation.handoffConfidence,
          level: conversation.handoffLevel,
          ticketId: conversation.handoffTicketId,
          at: conversation.handoffAt,
        }
      : null,
    lastMessage: last && { role: last.role, text: preview(last.parts) },
    updatedAt: conversation.updatedAt,
  };
}

export async function loadInbox(): Promise<InboxItem[]> {
  const db = await appDb();
  const since = new Date(Date.now() - CLOSED_WINDOW_MS);
  return Promise.all((await listConsoleConversations(db, since)).map(toItem));
}

/** Chamados do funcionário para o painel da direita: abertos primeiro, mais recentes antes. */
async function ticketsOf(analyst: SessionUser, employeeId: string) {
  try {
    const now = new Date();
    const tickets = await ticketsClient().as(analyst.id).listTickets("all", employeeId);
    const open = (status: (typeof tickets)[number]["status"]) => OPEN_STATUSES.includes(status);
    return tickets
      .sort(
        (a, b) =>
          Number(open(b.status)) - Number(open(a.status)) || b.updatedAt.localeCompare(a.updatedAt),
      )
      .map((t) => toView(t, now));
  } catch {
    return null;
  }
}

export async function loadConsoleConversation(
  analyst: SessionUser,
  id: string,
): Promise<ConsoleDetail> {
  const db = await appDb();
  const conversation = await getConversation(db, id);
  const [item, messages, tickets] = await Promise.all([
    toItem(conversation),
    listMessages(db, id),
    ticketsOf(analyst, conversation.employeeId),
  ]);
  return { item, messages, tickets };
}

async function notice(conversationId: string, text: string) {
  const db = await appDb();
  await appendMessage(
    db,
    conversationId,
    { role: "sistema", authorId: null, parts: [{ type: "system_event", text }] },
    new Date(),
  );
}

/** Só quem está atendendo mexe numa conversa assumida. */
async function assertNotTakenByOther(conversation: Conversation, analyst: SessionUser) {
  if (conversation.status === "com_analista" && conversation.assignedAnalystId !== analyst.id) {
    const other = await person(conversation.assignedAnalystId ?? "");
    throw new ConsoleError(`${other.name} já está atendendo esta conversa.`, "FORBIDDEN");
  }
  if (conversation.status === "encerrada") {
    throw new ConsoleError("Esta conversa já foi encerrada.", "INVALID");
  }
}

export async function actOnConversation(
  analyst: SessionUser,
  id: string,
  { op }: AnalystActionBody,
): Promise<ConsoleDetail> {
  const db = await appDb();
  const conversation = await getConversation(db, id);
  await assertNotTakenByOther(conversation, analyst);

  if (op === "assumir") {
    if (conversation.status === "com_analista") {
      throw new ConsoleError("Você já está atendendo esta conversa.", "INVALID");
    }
    await applyTransition(
      db,
      id,
      { event: { type: "assumir" }, actorId: analyst.id, patch: { assignedAnalystId: analyst.id } },
      new Date(),
    );
    await notice(id, `${analyst.name} assumiu · agent pausado`);
    // O chamado em foco passa a "Em atendimento". Se o sistema de chamados falhar, a conversa
    // continua assumida: o status do chamado é um reflexo, não a fonte da verdade.
    if (conversation.handoffTicketId) {
      await ticketsClient()
        .as(analyst.id)
        .updateAsAnalyst(conversation.handoffTicketId, {
          status: "Em atendimento",
          message: `Atendimento assumido por ${analyst.name} no chat.`,
        })
        .catch((err: unknown) => console.error("Falha ao atualizar o chamado:", err));
    }
  } else if (op === "devolver") {
    await applyTransition(db, id, { event: { type: "devolver" }, actorId: analyst.id }, new Date());
    await notice(id, `${analyst.name} devolveu a conversa ao assistente`);
  } else {
    await applyTransition(db, id, { event: { type: "encerrar" }, actorId: analyst.id }, new Date());
    await notice(id, `Atendimento encerrado por ${analyst.name}`);
  }
  return loadConsoleConversation(analyst, id);
}

export async function sendAnalystMessage(
  analyst: SessionUser,
  id: string,
  text: string,
): Promise<ConsoleDetail> {
  const db = await appDb();
  const conversation = await getConversation(db, id);
  if (conversation.status !== "com_analista" || conversation.assignedAnalystId !== analyst.id) {
    throw new ConsoleError("Assuma o atendimento para responder.", "FORBIDDEN");
  }
  await appendMessage(
    db,
    id,
    { role: "analista", authorId: analyst.id, parts: [{ type: "text", text }] },
    new Date(),
  );
  return loadConsoleConversation(analyst, id);
}
