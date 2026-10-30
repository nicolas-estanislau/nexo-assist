import { z } from "zod";
import type {
  ConversationStatus,
  DecisionTrace,
  MessagePart,
  MessageRole,
  SupportLevel,
} from "@nexo/shared";
import { TicketCategory } from "@nexo/shared";

// Contrato entre o servidor do chat e o navegador. Sem dependências de servidor.

export interface ChatMessage {
  id: string;
  role: MessageRole;
  authorId: string | null;
  parts: MessagePart[];
  trace: DecisionTrace | null;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  status: ConversationStatus;
  employeeMessageCount: number;
  analyst: { name: string; supportLevel: SupportLevel | null } | null;
}

export interface ChatState {
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  /** Mensagens do funcionário permitidas por conversa. */
  limit: number;
}

/** Eventos do turno, enviados em NDJSON enquanto o agent trabalha. */
export type ChatEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "action"; action: DecisionTrace["actions"][number] }
  | { type: "thinking" }
  | { type: "state"; state: ChatState }
  | { type: "error"; message: string };

export const SendMessageBody = z.object({ text: z.string().trim().min(1).max(2000) });

export const DraftActionBody = z.discriminatedUnion("op", [
  z.object({ op: z.literal("confirm") }),
  z.object({ op: z.literal("cancel") }),
  z.object({
    op: z.literal("edit"),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(3).max(2000),
    category: TicketCategory,
  }),
]);
export type DraftActionBody = z.infer<typeof DraftActionBody>;
