import "server-only";
import { confirmDraft, runTurn, type HistoryMessage, type TransferOutcome } from "@nexo/agent";
import { agentCanRespond, employeeCanSend } from "@nexo/domain";
import type { MessagePart, TicketDraft } from "@nexo/shared";
import type { ChatConversation, ChatEvent, ChatState, DraftActionBody } from "@/lib/chat";
import { agentInterpreter, ticketsConnection } from "./agent";
import {
  appendMessage,
  applyTransition,
  countAgentTurns,
  findActiveConversation,
  findLatestConversation,
  listMessages,
  replaceMessageParts,
  startConversation,
  type Conversation,
  type Message,
} from "./conversations";
import { appDb } from "./db";
import { env } from "./env";
import type { SessionUser } from "./session-token";
import { ticketsClient } from "./tickets";

// O chat do funcionário: grava as mensagens, roda o agent quando a conversa está com ele e
// aplica as transferências. Toda operação parte da sessão; o navegador só manda texto e ids.

export class ChatError extends Error {
  constructor(
    message: string,
    readonly code: "LIMIT" | "CLOSED" | "NOT_FOUND" | "INVALID",
  ) {
    super(message);
    this.name = "ChatError";
  }
}

type Emit = (event: ChatEvent) => void;

async function analystOf(conversation: Conversation): Promise<ChatConversation["analyst"]> {
  const withAnalyst = conversation.status === "com_analista" || conversation.status === "encerrada";
  if (!withAnalyst || !conversation.assignedAnalystId) return null;
  try {
    const analyst = await ticketsClient().getEmployee(conversation.assignedAnalystId);
    return { name: analyst.name, supportLevel: analyst.supportLevel };
  } catch {
    return { name: "Analista", supportLevel: null };
  }
}

async function toState(conversation: Conversation | null, messages: Message[]): Promise<ChatState> {
  return {
    conversation: conversation && {
      id: conversation.id,
      status: conversation.status,
      employeeMessageCount: conversation.employeeMessageCount,
      analyst: await analystOf(conversation),
    },
    messages,
    limit: env().MAX_MESSAGES_PER_SESSION,
  };
}

/**
 * Conversa que o funcionário vê: a em andamento ou, se um analista acabou de encerrar a última,
 * essa mesma (para ele ler o fechamento). Uma conversa que ele mesmo encerrou não volta.
 */
async function visibleConversation(user: SessionUser): Promise<Conversation | null> {
  const db = await appDb();
  const latest = await findLatestConversation(db, user.id);
  if (!latest) return null;
  if (latest.status !== "encerrada") return latest;
  return latest.closedBy && latest.closedBy !== user.id ? latest : null;
}

export async function loadChat(user: SessionUser): Promise<ChatState> {
  const db = await appDb();
  const conversation = await visibleConversation(user);
  return toState(conversation, conversation ? await listMessages(db, conversation.id) : []);
}

/** Encerra a conversa atual; a próxima mensagem começa outra (e zera o limite). */
export async function startNewChat(user: SessionUser): Promise<ChatState> {
  const db = await appDb();
  const conversation = await findActiveConversation(db, user.id);
  if (conversation) {
    await applyTransition(
      db,
      conversation.id,
      { event: { type: "encerrar" }, actorId: user.id, note: "Nova conversa pelo funcionário." },
      new Date(),
    );
  } else if (await visibleConversation(user)) {
    // A última foi encerrada por um analista: uma conversa nova a tira da tela.
    await startConversation(db, user.id, new Date());
  }
  return loadChat(user);
}

function employeeOf(user: SessionUser) {
  return { id: user.id, name: user.name, department: user.department };
}

/** Último rascunho ainda pendente na conversa: o agent precisa dele para aplicar mudanças. */
function pendingDraftIn(messages: Message[]): TicketDraft | null {
  for (const message of [...messages].reverse()) {
    for (const part of message.parts) {
      if (part.type === "draft_card") return part.state === "pendente" ? part.draft : null;
    }
  }
  return null;
}

async function applyTransfer(
  conversation: Conversation,
  transfer: TransferOutcome,
  emit: Emit,
): Promise<void> {
  const db = await appDb();
  await applyTransition(
    db,
    conversation.id,
    {
      event: { type: "transferir" },
      actorId: "agent",
      note: transfer.reason,
      patch: {
        handoffReason: transfer.reason,
        handoffSummary: transfer.summary,
        handoffConfidence: transfer.confidence,
        handoffTicketId: transfer.ticketId,
        handoffLevel: transfer.level,
        handoffAt: new Date().toISOString(),
      },
    },
    new Date(),
  );
  const notice = await appendMessage(
    db,
    conversation.id,
    {
      role: "sistema",
      authorId: null,
      parts: [
        {
          type: "system_event",
          text: `Conversa encaminhada ao Suporte ${transfer.level}. O assistente fica em pausa até um analista assumir.`,
        },
      ],
    },
    new Date(),
  );
  emit({ type: "message", message: notice });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Teto de uso do agent nas últimas 24 h, por funcionário e no total. Protege o custo do LLM
 * contra abuso; o analista continua respondendo normalmente.
 */
async function assertWithinDailyLimit(user: SessionUser) {
  const db = await appDb();
  const since = new Date(Date.now() - DAY_MS);
  const { USER_DAILY_TURN_LIMIT, DAILY_TURN_LIMIT } = env();
  if ((await countAgentTurns(db, since, user.id)) >= USER_DAILY_TURN_LIMIT) {
    throw new ChatError(
      `Você chegou ao limite de ${USER_DAILY_TURN_LIMIT} respostas do assistente nas últimas 24 horas. Tente de novo mais tarde.`,
      "LIMIT",
    );
  }
  if ((await countAgentTurns(db, since)) >= DAILY_TURN_LIMIT) {
    throw new ChatError(
      "O assistente atingiu o limite de uso de hoje. Tente de novo mais tarde.",
      "LIMIT",
    );
  }
}

export async function sendMessage(user: SessionUser, text: string, emit: Emit): Promise<void> {
  const db = await appDb();
  const conversation =
    (await findActiveConversation(db, user.id)) ??
    (await startConversation(db, user.id, new Date()));

  if (!employeeCanSend(conversation.status)) {
    throw new ChatError("Esta conversa foi encerrada.", "CLOSED");
  }
  if (conversation.employeeMessageCount >= env().MAX_MESSAGES_PER_SESSION) {
    throw new ChatError(
      `Esta conversa chegou ao limite de ${env().MAX_MESSAGES_PER_SESSION} mensagens. Comece uma nova conversa para continuar.`,
      "LIMIT",
    );
  }

  if (agentCanRespond(conversation.status)) await assertWithinDailyLimit(user);

  const history = await listMessages(db, conversation.id);
  const userMessage = await appendMessage(
    db,
    conversation.id,
    { role: "funcionario", authorId: user.id, parts: [{ type: "text", text }] },
    new Date(),
  );
  emit({ type: "message", message: userMessage });

  // Com um analista (ou na fila), o agent não responde: a mensagem só fica registrada.
  if (agentCanRespond(conversation.status)) {
    const result = await runTurn({
      employee: employeeOf(user),
      message: text,
      history: history.map((m): HistoryMessage => ({ role: m.role, parts: m.parts })),
      pendingDraft: pendingDraftIn(history),
      tickets: ticketsConnection(),
      interpreter: agentInterpreter(),
      onEvent: emit,
    });
    const reply = await appendMessage(
      db,
      conversation.id,
      { role: "agent", authorId: null, parts: result.parts, trace: result.trace },
      new Date(),
    );
    emit({ type: "message", message: reply });
    if (result.transfer) await applyTransfer(conversation, result.transfer, emit);
  }

  emit({ type: "state", state: await loadChat(user) });
}

function findDraft(messages: Message[], draftId: string) {
  for (const message of messages) {
    const index = message.parts.findIndex((p) => p.type === "draft_card" && p.draft.id === draftId);
    const part = message.parts[index];
    if (part?.type === "draft_card") return { message, index, part };
  }
  return null;
}

function withDraft(
  parts: MessagePart[],
  index: number,
  change: Partial<Extract<MessagePart, { type: "draft_card" }>>,
): MessagePart[] {
  return parts.map((p, i) => (i === index && p.type === "draft_card" ? { ...p, ...change } : p));
}

/** Confirmar, editar ou cancelar um rascunho. Os dados vêm do banco, não do navegador. */
export async function actOnDraft(
  user: SessionUser,
  draftId: string,
  body: DraftActionBody,
): Promise<ChatState> {
  const db = await appDb();
  const conversation = await findActiveConversation(db, user.id);
  if (!conversation) throw new ChatError("Conversa não encontrada.", "NOT_FOUND");
  const found = findDraft(await listMessages(db, conversation.id), draftId);
  if (!found) throw new ChatError("Rascunho não encontrado.", "NOT_FOUND");
  const { message, index, part } = found;
  if (part.state !== "pendente") {
    throw new ChatError("Este rascunho já foi confirmado ou cancelado.", "INVALID");
  }
  if (!agentCanRespond(conversation.status)) {
    throw new ChatError("A conversa está com um analista agora.", "INVALID");
  }

  if (body.op === "edit") {
    // Prioridade e prazo continuam os calculados pelas regras; só o texto muda.
    const draft: TicketDraft = {
      ...part.draft,
      title: part.draft.action === "create" ? body.title : part.draft.title,
      description: body.description,
      category: part.draft.action === "create" ? body.category : part.draft.category,
    };
    await replaceMessageParts(
      db,
      message.id,
      message.parts,
      withDraft(message.parts, index, { draft }),
    );
    return loadChat(user);
  }

  if (body.op === "cancel") {
    const changed = await replaceMessageParts(
      db,
      message.id,
      message.parts,
      withDraft(message.parts, index, { state: "cancelado" }),
    );
    if (changed) {
      await appendMessage(
        db,
        conversation.id,
        {
          role: "agent",
          authorId: null,
          parts: [
            {
              type: "text",
              text: "Tudo bem, descartei o rascunho. Posso ajudar com mais alguma coisa?",
            },
          ],
        },
        new Date(),
      );
    }
    return loadChat(user);
  }

  // Confirmar: marca primeiro (só um clique vence) e desfaz se o sistema de chamados falhar.
  const claimed = withDraft(message.parts, index, { state: "confirmado" });
  if (!(await replaceMessageParts(db, message.id, message.parts, claimed))) {
    throw new ChatError("Este rascunho já está sendo confirmado.", "INVALID");
  }
  const result = await confirmDraft({
    employee: employeeOf(user),
    draft: part.draft,
    tickets: ticketsConnection(),
  });
  if (!result.ok) await replaceMessageParts(db, message.id, claimed, message.parts);
  await appendMessage(
    db,
    conversation.id,
    { role: "agent", authorId: null, parts: result.parts, trace: result.trace },
    new Date(),
  );
  if (result.transfer) await applyTransfer(conversation, result.transfer, () => {});
  return loadChat(user);
}
