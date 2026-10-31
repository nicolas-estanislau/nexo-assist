import { z } from "zod";
import type { ConversationStatus, MessageRole, SupportLevel, TicketView } from "@nexo/shared";
import type { ChatMessage } from "./chat";

// Contrato entre o servidor e o console do analista (telas 4 e 5). Sem dependências de servidor.

export interface Person {
  id: string;
  name: string;
  department: string;
  supportLevel: SupportLevel | null;
}

export interface InboxItem {
  id: string;
  status: ConversationStatus;
  employee: Person;
  /** Quem assumiu (ou assumiu por último). */
  analyst: Person | null;
  /** Por que o agent passou a conversa para um analista. */
  handoff: {
    reason: string;
    summary: string | null;
    confidence: number | null;
    level: SupportLevel | null;
    ticketId: string | null;
    at: string | null;
  } | null;
  lastMessage: { role: MessageRole; text: string } | null;
  updatedAt: string;
}

export interface ConsoleDetail {
  item: InboxItem;
  messages: ChatMessage[];
  /** Chamados do funcionário; null quando o sistema de chamados não respondeu. */
  tickets: TicketView[] | null;
}

export const AnalystActionBody = z.object({ op: z.enum(["assumir", "devolver", "encerrar"]) });
export type AnalystActionBody = z.infer<typeof AnalystActionBody>;

/** Abaixo disso o agent não decide sozinho (mesmo limite da política do agent). */
export const LOW_CONFIDENCE = 0.6;

export type Tone = "danger" | "warn" | "ok" | "info" | "muted";

/** Linha colorida de cada item da lista, como no protótipo. */
export function inboxStatus(item: InboxItem, me: string): { label: string; tone: Tone } {
  switch (item.status) {
    case "aguardando_analista": {
      const confidence = item.handoff?.confidence;
      if (confidence != null && confidence < LOW_CONFIDENCE) {
        return {
          label: `Agent pediu ajuda · confiança ${Math.round(confidence * 100)}%`,
          tone: "warn",
        };
      }
      const ticket = item.handoff?.ticketId;
      return { label: ticket ? `Transferida · ${ticket}` : "Transferida", tone: "danger" };
    }
    case "com_analista":
      return item.analyst?.id === me
        ? { label: "Você está atendendo", tone: "info" }
        : { label: `Com ${item.analyst?.name ?? "outro analista"}`, tone: "info" };
    case "agente":
      return { label: "Agent atendendo", tone: "ok" };
    case "encerrada":
      return item.analyst
        ? { label: "Atendimento encerrado", tone: "muted" }
        : { label: "Resolvida pelo agent", tone: "muted" };
  }
}

export type InboxFilter = "todas" | "para_voce" | "com_agent" | "minhas";

export function matchesFilter(item: InboxItem, filter: InboxFilter, me: Person): boolean {
  switch (filter) {
    case "todas":
      return true;
    case "para_voce":
      // Fila do nível do analista; transferências sem nível ficam para todos.
      return (
        item.status === "aguardando_analista" &&
        (item.handoff?.level == null || item.handoff.level === me.supportLevel)
      );
    case "com_agent":
      return item.status === "agente";
    case "minhas":
      return item.status === "com_analista" && item.analyst?.id === me.id;
  }
}

/** Busca por nome, departamento ou número de chamado. */
export function matchesSearch(item: InboxItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.employee.name, item.employee.department, item.handoff?.ticketId ?? ""].some((v) =>
    v.toLowerCase().includes(q),
  );
}
