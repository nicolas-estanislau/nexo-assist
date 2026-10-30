"use client";

import { ArrowUp, Headset, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatShortDate, type DecisionTrace, type MessagePart } from "@nexo/shared";
import { DecisionChips, DecisionPanel } from "@/components/decision";
import { PageHeader } from "@/components/page-header";
import { StatusDot, TicketCard } from "@/components/tickets";
import type { ChatEvent, ChatMessage, ChatState } from "@/lib/chat";
import { DraftCard, type DraftEdit } from "./draft-card";

// Telas 2 e 3 do protótipo. O turno chega em NDJSON: os passos do agent aparecem enquanto ele
// trabalha e a resposta entra quando fica pronta. Com um analista, a tela consulta o servidor.

type Action = DecisionTrace["actions"][number];
type QuickReplies = Extract<MessagePart, { type: "quick_replies" }>;
interface Pending {
  actions: Action[];
  thinking: boolean;
}

const SUGGESTIONS = [
  "Minha VPN não conecta",
  "Qual o status do meu chamado?",
  "Preciso instalar um software",
];

async function readEvents(response: Response, onEvent: (event: ChatEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as ChatEvent);
  }
}

async function jsonOrError(response: Response): Promise<ChatState> {
  const data = (await response.json()) as ChatState | { error: string };
  if (!response.ok || "error" in data) {
    throw new Error("error" in data ? data.error : "Falha na requisição.");
  }
  return data;
}

const textOf = (message: ChatMessage | undefined) =>
  message?.role === "funcionario" && message.parts[0]?.type === "text" ? message.parts[0].text : "";

/** Texto e opções rápidas logo depois ficam no mesmo balão, como no protótipo. */
function groupParts(parts: MessagePart[]) {
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

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[78%] rounded-lg border border-line bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
      {children}
    </div>
  );
}

export function Chat({ initial, firstName }: { initial: ChatState; firstName: string }) {
  const [chat, setChat] = useState(initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTrace, setOpenTrace] = useState<string | null>(null);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLElement>(null);

  const status = chat.conversation?.status ?? "agente";
  const count = chat.conversation?.employeeMessageCount ?? 0;
  const atLimit = count >= chat.limit;
  const busy = pending !== null || optimistic !== null;
  const withHuman = status === "aguardando_analista" || status === "com_analista";
  const lastId = chat.messages.at(-1)?.id;
  const traced = chat.messages.find((m) => m.id === openTrace)?.trace ?? null;

  useEffect(() => {
    // Depois do layout: cards e rascunhos mudam a altura após o render.
    const el = scroller.current;
    if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
  }, [chat.messages.length, lastId, pending, optimistic]);

  const refresh = useCallback(async () => {
    try {
      setChat(await jsonOrError(await fetch("/api/chat", { cache: "no-store" })));
    } catch {
      // Mantém o que está na tela.
    }
  }, []);

  // Com um analista, as respostas chegam pelo console: consulta a cada 3 s.
  useEffect(() => {
    if (!withHuman || busy) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [withHuman, busy, refresh]);

  async function send(message: string) {
    const value = message.trim();
    if (!value || busy || atLimit) return;
    setError(null);
    setText("");
    setOptimistic(value);
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!response.ok) throw new Error(((await response.json()) as { error: string }).error);
      await readEvents(response, (event) => {
        switch (event.type) {
          case "message":
            setChat((c) => ({ ...c, messages: [...c.messages, event.message] }));
            if (event.message.role === "funcionario") {
              setOptimistic(null);
              if (status === "agente") setPending({ actions: [], thinking: false });
            } else if (event.message.role === "agent") {
              setPending(null);
            }
            break;
          case "action":
            setPending((p) => p && { ...p, actions: [...p.actions, event.action] });
            break;
          case "thinking":
            setPending((p) => p && { ...p, thinking: true });
            break;
          case "state":
            setChat(event.state);
            break;
          case "error":
            setError(event.message);
            break;
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar.");
      setText(value);
    } finally {
      setOptimistic(null);
      setPending(null);
      await refresh();
    }
  }

  async function draftAction(id: string, body: object): Promise<boolean> {
    setDraftBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/chat/drafts/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setChat(await jsonOrError(response));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir.");
      await refresh();
      return false;
    } finally {
      setDraftBusy(null);
    }
  }

  async function newConversation() {
    if (busy) return;
    setOpenTrace(null);
    setError(null);
    try {
      setChat(await jsonOrError(await fetch("/api/chat", { method: "DELETE" })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar outra conversa.");
    }
  }

  function renderReplies(replies: QuickReplies, live: boolean, answer: string) {
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
                onClick={() => send(option.value)}
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

  function renderBlock(
    message: ChatMessage,
    { part, replies }: ReturnType<typeof groupParts>[number],
    key: number,
    answer: string,
  ) {
    const live = message.id === lastId && status === "agente" && !busy;
    switch (part.type) {
      case "text":
        return (
          <Bubble key={key}>
            <p className="whitespace-pre-line">{part.text}</p>
            {replies && renderReplies(replies, live, answer)}
          </Bubble>
        );
      case "quick_replies":
        return <Bubble key={key}>{renderReplies(part, live, answer)}</Bubble>;
      case "ticket_select":
        return (
          <div
            key={key}
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
                  onClick={() => send(`${ticket.id} · ${ticket.title}`)}
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
                  {sla.overdue && (
                    <span className="text-[11px] font-medium text-danger">vencido</span>
                  )}
                  <StatusDot status={ticket.status} className="text-[11px]" />
                  <span className="w-11 shrink-0 text-right text-[11px] text-muted">
                    {formatShortDate(ticket.createdAt)}
                  </span>
                </button>
              );
            })}
          </div>
        );
      case "ticket_card":
        return <TicketCard key={key} view={part.view} />;
      case "draft_card":
        return (
          <DraftCard
            key={`${key}-${part.draft.id}-${part.draft.title}-${part.draft.description}`}
            draft={part.draft}
            state={part.state}
            actionable={status === "agente" && !busy}
            busy={draftBusy === part.draft.id}
            onConfirm={() => draftAction(part.draft.id, { op: "confirm" })}
            onCancel={() => draftAction(part.draft.id, { op: "cancel" })}
            onEdit={(edit: DraftEdit) => draftAction(part.draft.id, { op: "edit", ...edit })}
          />
        );
      case "system_event":
        return (
          <p
            key={key}
            className="flex w-full items-center gap-3 text-[11px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line"
          >
            {part.text}
          </p>
        );
    }
  }

  function renderMessage(message: ChatMessage, index: number) {
    if (message.role === "funcionario") {
      return (
        <div key={message.id} className="flex justify-end">
          <p className="max-w-[78%] rounded-lg bg-ink px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-line text-white">
            {textOf(message)}
          </p>
        </div>
      );
    }
    const answer = textOf(chat.messages[index + 1]);
    const blocks = groupParts(message.parts).map((block, i) =>
      renderBlock(message, block, i, answer),
    );
    if (message.role === "sistema") return <div key={message.id}>{blocks}</div>;

    const analyst = chat.conversation?.analyst;
    return (
      <div key={message.id} className="flex flex-col items-start gap-1.5">
        {message.role === "agent" ? (
          <DecisionChips
            trace={message.trace}
            onOpen={() => setOpenTrace(openTrace === message.id ? null : message.id)}
          />
        ) : (
          <p className="flex items-center gap-2 text-[11px]">
            <span className="font-semibold">{analyst?.name ?? "Analista"}</span>
            {analyst?.supportLevel && (
              <span className="rounded bg-ok/10 px-1.5 py-px font-medium text-ok">
                Suporte {analyst.supportLevel}
              </span>
            )}
          </p>
        )}
        {blocks}
      </div>
    );
  }

  const statusPill =
    status === "com_analista" ? (
      <span className="flex items-center gap-1.5 rounded-full bg-info/10 px-2.5 py-1 text-[12px] font-medium text-info">
        <Headset className="size-3.5" /> Com {chat.conversation?.analyst?.name ?? "um analista"}
      </span>
    ) : status === "aguardando_analista" ? (
      <span className="flex items-center gap-1.5 rounded-full bg-warn/10 px-2.5 py-1 text-[12px] font-medium text-warn">
        <span className="size-1.5 animate-pulse rounded-full bg-warn" /> Aguardando analista
      </span>
    ) : (
      <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[12px] font-medium text-ok">
        <span className="size-1.5 rounded-full bg-ok" /> Assistente online
      </span>
    );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title="Atendimento"
          aside={
            <div className="flex items-center gap-2">
              {chat.conversation && (
                <button
                  type="button"
                  onClick={newConversation}
                  disabled={busy}
                  title="Encerra esta conversa e começa outra"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted hover:bg-canvas hover:text-ink disabled:opacity-60"
                >
                  <RotateCcw className="size-3.5" /> Nova conversa
                </button>
              )}
              {statusPill}
            </div>
          }
        />

        {withHuman && (
          <p className="border-b border-line bg-warn/5 px-6 py-2 text-center text-[12px] text-ink-soft">
            {status === "com_analista"
              ? "Um analista está atendendo você. O assistente fica em pausa até a conversa voltar para ele."
              : "Sua conversa está na fila de um analista, com todo o histórico. Você pode continuar escrevendo."}
          </p>
        )}

        <main ref={scroller} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[680px] flex-col gap-4 px-6 py-8">
            {chat.messages.length === 0 && !optimistic && (
              <div className="flex flex-col items-start gap-1.5">
                <DecisionChips trace={null} />
                <Bubble>
                  <p>
                    Olá, {firstName}! Sou o Nexo Assist, do service desk de TI. Me conte o que está
                    acontecendo: eu consulto seus chamados, busco na central de ajuda e abro um
                    chamado quando for preciso.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-md border border-line px-2.5 py-1 text-[12.5px] hover:border-brand/40 hover:bg-brand-soft"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </Bubble>
              </div>
            )}

            {chat.messages.map(renderMessage)}

            {optimistic && (
              <div className="flex justify-end opacity-70">
                <p className="max-w-[78%] rounded-lg bg-ink px-3.5 py-2.5 text-[13.5px] whitespace-pre-line text-white">
                  {optimistic}
                </p>
              </div>
            )}

            {pending && (
              <div className="flex flex-col items-start gap-1.5">
                <DecisionChips trace={null} live={pending} />
                {!pending.thinking && pending.actions.length === 0 && (
                  <Loader2 className="size-4 animate-spin text-muted" />
                )}
              </div>
            )}
          </div>
        </main>

        <footer className="px-6 pb-4">
          <div className="mx-auto max-w-[680px]">
            {error && (
              <p
                role="alert"
                className="mb-2 rounded-lg bg-danger/5 px-3 py-2 text-[13px] text-danger"
              >
                {error}
              </p>
            )}
            {atLimit ? (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-canvas px-4 py-3 text-[13px]">
                <p className="text-ink-soft">
                  Esta conversa chegou ao limite de {chat.limit} mensagens. Seus chamados continuam
                  salvos.
                </p>
                <button
                  type="button"
                  onClick={newConversation}
                  className="shrink-0 rounded-md bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-hover"
                >
                  Nova conversa
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(text);
                }}
                className="flex items-end gap-2 rounded-lg border border-line bg-white py-1.5 pr-1.5 pl-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                      e.preventDefault();
                      void send(text);
                    }
                  }}
                  rows={1}
                  maxLength={2000}
                  aria-label="Mensagem"
                  placeholder={withHuman ? "Escreva para o analista…" : "Escreva para o Nexo…"}
                  className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || !text.trim()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:bg-brand-hover disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="size-3.5" />
                  )}
                  Enviar
                </button>
              </form>
            )}
            <p
              className={`mt-1.5 text-right text-[11px] ${count >= chat.limit - 5 ? "text-warn" : "text-muted"}`}
            >
              {count}/{chat.limit} mensagens nesta sessão
            </p>
          </div>
        </footer>
      </div>

      {traced && <DecisionPanel trace={traced} onClose={() => setOpenTrace(null)} />}
    </div>
  );
}
