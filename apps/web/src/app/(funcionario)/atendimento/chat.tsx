"use client";

import { ArrowUp, Headset, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DecisionTrace, MessagePart } from "@nexo/shared";
import { Avatar } from "@/components/avatar";
import { DecisionChips, DecisionPanel } from "@/components/decision";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, TicketCard } from "@/components/tickets";
import type { ChatEvent, ChatMessage, ChatState } from "@/lib/chat";
import { DraftCard, type DraftEdit } from "./draft-card";

// Telas 2 e 3 do protótipo. O turno chega em NDJSON: os chips de ação aparecem enquanto o agent
// trabalha e a resposta entra quando fica pronta. Com um analista, a tela consulta o servidor.

type Action = DecisionTrace["actions"][number];
interface Pending {
  actions: Action[];
  thinking: boolean;
}

const SUGGESTIONS = [
  "Minha VPN não conecta",
  "Como está meu chamado?",
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

function AgentAvatar() {
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white">
      <Sparkles className="size-3.5" />
    </span>
  );
}

function Bubble({
  children,
  tone = "agent",
}: {
  children: React.ReactNode;
  tone?: "agent" | "me";
}) {
  return (
    <p
      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-line ${
        tone === "me" ? "rounded-br-md bg-brand text-white" : "rounded-tl-md bg-canvas text-ink"
      }`}
    >
      {children}
    </p>
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

  // Com um analista, as respostas chegam pelo console: consulta a cada 3 s.
  useEffect(() => {
    if (!withHuman || busy) return;
    const timer = setInterval(async () => {
      try {
        setChat(await jsonOrError(await fetch("/api/chat", { cache: "no-store" })));
      } catch {
        // Tenta de novo no próximo ciclo.
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [withHuman, busy]);

  const refresh = useCallback(async () => {
    try {
      setChat(await jsonOrError(await fetch("/api/chat", { cache: "no-store" })));
    } catch {
      // Mantém o que está na tela.
    }
  }, []);

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

  function renderPart(message: ChatMessage, part: MessagePart, key: number) {
    const isLast = message.id === lastId && status === "agente" && !busy;
    switch (part.type) {
      case "text":
        return <Bubble key={key}>{part.text}</Bubble>;
      case "quick_replies":
        if (!isLast) return null;
        return (
          <div key={key} className="max-w-[85%]">
            {part.question && <p className="mb-1.5 text-[13px] text-ink-soft">{part.question}</p>}
            <div className="flex flex-wrap gap-2">
              {part.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => send(option.value)}
                  className="rounded-full border border-brand/30 bg-white px-3 py-1.5 text-[13px] text-brand hover:bg-brand-soft"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        );
      case "ticket_select":
        return (
          <div
            key={key}
            className="w-full max-w-md divide-y divide-line rounded-xl border border-line bg-white"
          >
            {part.tickets.map(({ ticket, sla }) => (
              <button
                key={ticket.id}
                type="button"
                disabled={!isLast}
                onClick={() => send(`Quero saber do ${ticket.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left enabled:hover:bg-canvas disabled:cursor-default"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold">
                    {ticket.id}
                    {sla.overdue && <span className="ml-2 font-medium text-danger">vencido</span>}
                  </p>
                  <p className="truncate text-[13px] text-ink-soft">{ticket.title}</p>
                </div>
                <StatusBadge status={ticket.status} />
              </button>
            ))}
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
            className="mx-auto rounded-full bg-canvas px-3 py-1 text-center text-[12px] text-muted"
          >
            {part.text}
          </p>
        );
    }
  }

  function renderMessage(message: ChatMessage) {
    if (message.role === "funcionario") {
      const textPart = message.parts.find((p) => p.type === "text");
      return (
        <div key={message.id} className="flex justify-end">
          <Bubble tone="me">{textPart?.type === "text" ? textPart.text : ""}</Bubble>
        </div>
      );
    }
    if (message.role === "sistema") {
      return (
        <div key={message.id} className="flex justify-center">
          {message.parts.map((part, i) => renderPart(message, part, i))}
        </div>
      );
    }
    const isAgent = message.role === "agent";
    const analyst = chat.conversation?.analyst;
    return (
      <div key={message.id} className="flex gap-2.5">
        {isAgent ? <AgentAvatar /> : <Avatar name={analyst?.name ?? "Analista"} size="sm" />}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <p className="text-[12px] font-medium text-ink-soft">
            {isAgent
              ? "Nexo Assist"
              : `${analyst?.name ?? "Analista"}${analyst?.supportLevel ? ` · Suporte ${analyst.supportLevel}` : ""}`}
          </p>
          {isAgent && message.trace && (
            <DecisionChips
              trace={message.trace}
              onOpen={() => setOpenTrace(openTrace === message.id ? null : message.id)}
            />
          )}
          {message.parts.map((part, i) => renderPart(message, part, i))}
        </div>
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
            <div className="flex items-center gap-3">
              {statusPill}
              {chat.conversation && (
                <button
                  type="button"
                  onClick={newConversation}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink-soft hover:bg-canvas disabled:opacity-60"
                >
                  <RotateCcw className="size-3.5" /> Nova conversa
                </button>
              )}
            </div>
          }
        />

        {withHuman && (
          <p className="border-b border-line bg-warn/5 px-6 py-2 text-[12px] text-ink-soft">
            {status === "com_analista"
              ? "Um analista está atendendo você. O assistente fica em pausa até a conversa voltar para ele."
              : "Sua conversa está na fila de um analista, com todo o histórico. Você pode continuar escrevendo."}
          </p>
        )}

        <main ref={scroller} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
            {chat.messages.length === 0 && !optimistic && (
              <div className="flex gap-2.5">
                <AgentAvatar />
                <div className="flex flex-col items-start gap-2">
                  <p className="text-[12px] font-medium text-ink-soft">Nexo Assist</p>
                  <Bubble>
                    Olá, {firstName}! Sou o Nexo Assist, do service desk de TI. Me conte o que está
                    acontecendo: eu consulto seus chamados, busco na central de ajuda e abro um
                    chamado quando for preciso.
                  </Bubble>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-full border border-brand/30 bg-white px-3 py-1.5 text-[13px] text-brand hover:bg-brand-soft"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {chat.messages.map(renderMessage)}

            {optimistic && (
              <div className="flex justify-end opacity-70">
                <Bubble tone="me">{optimistic}</Bubble>
              </div>
            )}

            {pending && (
              <div className="flex gap-2.5">
                <AgentAvatar />
                <div className="flex flex-col items-start gap-2">
                  <p className="text-[12px] font-medium text-ink-soft">Nexo Assist</p>
                  <DecisionChips trace={null} live={pending} />
                  {!pending.thinking && pending.actions.length === 0 && (
                    <Loader2 className="size-4 animate-spin text-muted" />
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="border-t border-line px-6 py-4">
          <div className="mx-auto max-w-3xl">
            {error && (
              <p
                role="alert"
                className="mb-2 rounded-lg bg-danger/5 px-3 py-2 text-[13px] text-danger"
              >
                {error}
              </p>
            )}
            {atLimit ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-canvas px-4 py-3 text-[13px]">
                <p className="text-ink-soft">
                  Esta conversa chegou ao limite de {chat.limit} mensagens. Seus chamados continuam
                  salvos.
                </p>
                <button
                  type="button"
                  onClick={newConversation}
                  className="shrink-0 rounded-lg bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-hover"
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
                className="flex items-end gap-2 rounded-xl border border-line bg-white p-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(text);
                    }
                  }}
                  rows={1}
                  maxLength={2000}
                  aria-label="Mensagem"
                  placeholder={
                    withHuman
                      ? "Escreva para o analista…"
                      : "Descreva o problema ou faça uma pergunta…"
                  }
                  className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || !text.trim()}
                  aria-label="Enviar"
                  className="inline-flex size-9 items-center justify-center rounded-lg bg-brand text-white hover:bg-brand-hover disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </button>
              </form>
            )}
            <p className="mt-1.5 flex justify-between text-[11px] text-muted">
              <span>Enter envia · Shift+Enter quebra a linha</span>
              <span className={count >= chat.limit - 5 ? "text-warn" : ""}>
                {count}/{chat.limit} mensagens
              </span>
            </p>
          </div>
        </footer>
      </div>

      {traced && <DecisionPanel trace={traced} onClose={() => setOpenTrace(null)} />}
    </div>
  );
}
