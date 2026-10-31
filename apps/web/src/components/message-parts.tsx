import { formatShortDate, type MessagePart } from "@nexo/shared";
import type { ChatMessage } from "@/lib/chat";
import { StatusDot } from "./tickets";

// Peças das mensagens usadas no chat do funcionário (interativas) e no console (só leitura).

export type QuickReplies = Extract<MessagePart, { type: "quick_replies" }>;
type TicketSelectPart = Extract<MessagePart, { type: "ticket_select" }>;

/** Texto da mensagem do funcionário; serve para destacar a opção que ele escolheu. */
export const textOf = (message: ChatMessage | undefined) =>
  message?.role === "funcionario" && message.parts[0]?.type === "text" ? message.parts[0].text : "";

/** Texto e opções rápidas logo depois ficam no mesmo balão, como no protótipo. */
export function groupParts(parts: MessagePart[]) {
  const blocks: { part: MessagePart; replies: QuickReplies | null }[] = [];
  parts.forEach((part, i) => {
    if (part.type === "quick_replies" && parts[i - 1]?.type === "text") return;
    const next = parts[i + 1];
    blocks.push({
      part,
      replies: part.type === "text" && next?.type === "quick_replies" ? next : null,
    });
  });
  return blocks;
}

const BUBBLE_TONE = {
  white: "border-line bg-white",
  agent: "border-brand/15 bg-brand-soft",
  analyst: "border-ok/20 bg-ok/10",
} as const;

export function Bubble({
  children,
  tone = "white",
}: {
  children: React.ReactNode;
  tone?: keyof typeof BUBBLE_TONE;
}) {
  return (
    <div
      className={`max-w-[78%] rounded-lg border px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink ${BUBBLE_TONE[tone]}`}
    >
      {children}
    </div>
  );
}

export function QuickReplyOptions({
  replies,
  live,
  answer,
  onPick,
}: {
  replies: QuickReplies;
  live: boolean;
  answer: string;
  onPick?: (value: string) => void;
}) {
  return (
    <>
      {replies.question && <p className="mt-2 font-semibold">{replies.question}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {replies.options.map((option) => {
          const chosen = !live && answer.startsWith(option.value);
          return (
            <button
              key={option.value}
              type="button"
              disabled={!live}
              onClick={() => onPick?.(option.value)}
              className={`rounded-md border px-2.5 py-1 text-[12.5px] transition ${
                chosen
                  ? "border-brand/40 bg-brand-soft text-brand"
                  : "border-line bg-white text-ink enabled:hover:border-brand/40 enabled:hover:bg-brand-soft disabled:text-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function TicketSelect({
  part,
  live,
  answer,
  onPick,
}: {
  part: TicketSelectPart;
  live: boolean;
  answer: string;
  onPick?: (value: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="w-full divide-y divide-line overflow-hidden rounded-lg border border-line bg-white"
    >
      {part.tickets.map(({ ticket, sla }) => {
        const chosen = answer.includes(ticket.id);
        return (
          <button
            key={ticket.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            disabled={!live}
            onClick={() => onPick?.(`${ticket.id} · ${ticket.title}`)}
            className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13px] enabled:hover:bg-canvas ${
              chosen ? "bg-canvas" : ""
            }`}
          >
            <span
              className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border ${
                chosen ? "border-brand" : "border-slate-300"
              }`}
            >
              {chosen && <span className="size-2 rounded-full bg-brand" />}
            </span>
            <span className="w-16 shrink-0 text-[11px] text-muted">{ticket.id}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{ticket.title}</span>
            {sla.overdue && <span className="text-[11px] font-medium text-danger">vencido</span>}
            <StatusDot status={ticket.status} className="text-[11px]" />
            <span className="w-11 shrink-0 text-right text-[11px] text-muted">
              {formatShortDate(ticket.createdAt)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SystemEvent({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex w-full items-center gap-3 text-[11px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
      {children}
    </p>
  );
}
