import type { ConversationStatus } from "@nexo/shared";

// Máquina de estados da conversa. Toda mudança de "com quem está a conversa" passa por aqui,
// e o banco só grava transições que esta função aceitou.
//
//   agente ──transferir──▶ aguardando_analista ──assumir──▶ com_analista
//     ▲  └────────────────────── assumir ─────────────────────▶ │
//     └──────────────── devolver ◀──────────────────────────────┘
//   qualquer estado ──encerrar──▶ encerrada

export type ConversationEvent =
  { type: "transferir" } | { type: "assumir" } | { type: "devolver" } | { type: "encerrar" };

const ALLOWED: Record<ConversationEvent["type"], readonly ConversationStatus[]> = {
  transferir: ["agente"],
  assumir: ["agente", "aguardando_analista"],
  devolver: ["aguardando_analista", "com_analista"],
  encerrar: ["agente", "aguardando_analista", "com_analista"],
};

const TARGET: Record<ConversationEvent["type"], ConversationStatus> = {
  transferir: "aguardando_analista",
  assumir: "com_analista",
  devolver: "agente",
  encerrar: "encerrada",
};

export type TransitionResult =
  { ok: true; status: ConversationStatus } | { ok: false; error: string };

export function transition(from: ConversationStatus, event: ConversationEvent): TransitionResult {
  if (!ALLOWED[event.type].includes(from)) {
    return { ok: false, error: `Não é possível ${event.type} uma conversa em "${from}".` };
  }
  return { ok: true, status: TARGET[event.type] };
}

/** O agent só responde quando a conversa está com ele; com analista, fica em silêncio. */
export function agentCanRespond(status: ConversationStatus): boolean {
  return status === "agente";
}

export function employeeCanSend(status: ConversationStatus): boolean {
  return status !== "encerrada";
}
