"use client";

import { ArrowUp, ArrowLeftRight, Hand, Headset, Loader2, LogOut, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDue, formatShortDate, OPEN_STATUSES, type TicketView } from "@nexo/shared";
import { logout } from "@/app/login/actions";
import { Avatar } from "@/components/avatar";
import { DecisionChips, DecisionPanel } from "@/components/decision";
import { Logo } from "@/components/logo";
import {
  Bubble,
  groupParts,
  QuickReplyOptions,
  SystemEvent,
  TicketSelect,
  textOf,
} from "@/components/message-parts";
import { PriorityTag, StatusDot, TicketCard } from "@/components/tickets";
import type { ChatMessage } from "@/lib/chat";
import {
  inboxStatus,
  matchesFilter,
  matchesSearch,
  type AnalystActionBody,
  type ConsoleDetail,
  type InboxFilter,
  type InboxItem,
  type Person,
  type Tone,
} from "@/lib/console";
import { DraftCard } from "@/components/draft-card";

// Telas 4 e 5 do protótipo: lista de conversas, a conversa no centro e os chamados do
// funcionário à direita. A tela consulta o servidor a cada 3 s para ver mensagens novas.

const POLL_MS = 3000;

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "para_voce", label: "Para você" },
  { id: "com_agent", label: "Com o agent" },
  { id: "minhas", label: "Minhas" },
];

const TONE: Record<Tone, { dot: string; text: string }> = {
  danger: { dot: "bg-danger", text: "text-danger" },
  warn: { dot: "bg-warn", text: "text-warn" },
  ok: { dot: "bg-ok", text: "text-ok" },
  info: { dot: "bg-info", text: "text-info" },
  muted: { dot: "bg-slate-400", text: "text-muted" },
};

const firstName = (name: string) => name.split(" ")[0] ?? name;
const time = (iso: string) => formatDue(new Date(iso), new Date());

function minutesSince(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)} h`;
}

async function json<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T | { error: string };
  if (!response.ok || (typeof data === "object" && data !== null && "error" in data)) {
    throw new Error((data as { error?: string }).error ?? "Falha na requisição.");
  }
  return data as T;
}

export function Console({
  me,
  initialItems,
  initialDetail,
}: {
  me: Person;
  initialItems: InboxItem[];
  initialDetail: ConsoleDetail | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [detail, setDetail] = useState(initialDetail);
  const [filter, setFilter] = useState<InboxFilter>("todas");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [openTrace, setOpenTrace] = useState<string | null>(null);
  const scroller = useRef<HTMLElement>(null);

  const selectedId = detail?.item.id ?? null;
  const lastId = detail?.messages.at(-1)?.id;
  const traced = detail?.messages.find((m) => m.id === openTrace)?.trace ?? null;

  useEffect(() => {
    const el = scroller.current;
    if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
  }, [selectedId, lastId]);

  const refresh = useCallback(async () => {
    try {
      const list = await json<{ items: InboxItem[] }>(
        await fetch("/api/console/conversations", { cache: "no-store" }),
      );
      setItems(list.items);
      if (selectedId) {
        const next = await json<ConsoleDetail>(
          await fetch(`/api/console/conversations/${selectedId}`, { cache: "no-store" }),
        );
        // Ignora a resposta se o analista trocou de conversa enquanto ela chegava.
        setDetail((d) => (d?.item.id === next.item.id ? next : d));
      }
    } catch {
      // Mantém o que está na tela; a próxima consulta tenta de novo.
    }
  }, [selectedId]);

  useEffect(() => {
    if (busy) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [busy, refresh]);

  async function select(id: string) {
    if (id === selectedId) return;
    setError(null);
    setOpenTrace(null);
    setText("");
    setBusy("abrir");
    window.history.replaceState(null, "", `/console?c=${encodeURIComponent(id)}`);
    try {
      setDetail(
        await json<ConsoleDetail>(
          await fetch(`/api/console/conversations/${id}`, { cache: "no-store" }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir a conversa.");
    } finally {
      setBusy(null);
    }
  }

  async function post(path: string, body: object, label: string): Promise<boolean> {
    if (!selectedId || busy) return false;
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(`/api/console/conversations/${selectedId}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setDetail(await json<ConsoleDetail>(response));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir.");
      return false;
    } finally {
      setBusy(null);
      void refresh();
    }
  }

  const act = (op: AnalystActionBody["op"]) => post("", { op }, op);

  async function reply() {
    const value = text.trim();
    if (!value) return;
    setText("");
    if (!(await post("/messages", { text: value }, "enviar"))) setText(value);
  }

  const visible = items.filter((i) => matchesFilter(i, filter, me) && matchesSearch(i, query));

  return (
    <div className="flex h-screen">
      <Inbox
        me={me}
        items={visible}
        counts={Object.fromEntries(
          FILTERS.map((f) => [f.id, items.filter((i) => matchesFilter(i, f.id, me)).length]),
        )}
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        selectedId={selectedId}
        onSelect={select}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-canvas">
        {detail ? (
          <>
            <ConversationHeader item={detail.item} me={me} busy={busy} onAct={act} />
            <main ref={scroller} className="flex-1 overflow-y-auto">
              <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-6 py-6">
                <Handoff item={detail.item} />
                {detail.messages.map((message, i) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    next={detail.messages[i + 1]}
                    item={detail.item}
                    traceOpen={openTrace === message.id}
                    onTrace={() => setOpenTrace(openTrace === message.id ? null : message.id)}
                  />
                ))}
              </div>
            </main>
            <Composer
              item={detail.item}
              me={me}
              dueAt={focusedTicket(detail)?.sla.dueAt ?? null}
              busy={busy}
              error={error}
              text={text}
              onText={setText}
              onReply={reply}
              onAct={act}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-muted">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Escolha uma conversa na lista."}
          </div>
        )}
      </section>

      {traced ? (
        <DecisionPanel trace={traced} onClose={() => setOpenTrace(null)} />
      ) : (
        detail && <TicketsPanel detail={detail} />
      )}
    </div>
  );
}

function Inbox({
  me,
  items,
  counts,
  filter,
  onFilter,
  query,
  onQuery,
  selectedId,
  onSelect,
}: {
  me: Person;
  items: InboxItem[];
  counts: Record<string, number>;
  filter: InboxFilter;
  onFilter: (f: InboxFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="flex w-[280px] shrink-0 lg:w-[320px] flex-col border-r border-line bg-white">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
        <Logo />
        <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[12px] font-medium text-ok">
          <span className="size-1.5 rounded-full bg-ok" /> Disponível
        </span>
      </div>

      <div className="space-y-3 border-b border-line px-4 py-3">
        <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
          <Search className="size-3.5 text-muted" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            aria-label="Pesquisar conversa ou chamado"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${
                filter === f.id ? "bg-ink text-white" : "bg-canvas text-ink-soft hover:bg-line"
              }`}
            >
              {f.label}
              {f.id !== "todas" && <span className="ml-1 opacity-70">{counts[f.id] ?? 0}</span>}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <li className="px-5 py-8 text-center text-[13px] text-muted">Nenhuma conversa aqui.</li>
        )}
        {items.map((item) => {
          const status = inboxStatus(item, me.id);
          const tone = TONE[status.tone];
          const who =
            item.lastMessage?.role === "agent"
              ? "Nexo: "
              : item.lastMessage?.role === "analista"
                ? item.analyst?.id === me.id
                  ? "Você: "
                  : `${firstName(item.analyst?.name ?? "Analista")}: `
                : "";
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={item.id === selectedId}
                className={`flex w-full gap-3 border-b border-line px-4 py-3 text-left hover:bg-canvas ${
                  item.id === selectedId ? "bg-brand-soft/60" : ""
                }`}
              >
                <Avatar name={item.employee.name} seed={item.employee.id} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold">{item.employee.name}</span>
                    <span className="shrink-0 text-[11px] text-muted">{time(item.updatedAt)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted">
                    {who}
                    {item.lastMessage?.text}
                  </span>
                  <span
                    className={`mt-1 flex items-center gap-1.5 text-[11px] font-medium ${tone.text}`}
                  >
                    <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
                    <span className="truncate">{status.label}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2.5 border-t border-line px-4 py-3">
        <Avatar name={me.name} size="sm" self />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{me.name}</p>
          <p className="text-[11px] text-muted">Suporte {me.supportLevel ?? "—"}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            title="Sair"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-ink-soft hover:bg-canvas hover:text-ink"
          >
            <LogOut className="size-3.5" /> Sair
          </button>
        </form>
      </div>
    </aside>
  );
}

function StatusPill({ item }: { item: InboxItem }) {
  const pill = {
    aguardando_analista: {
      text: "Aguardando atendente",
      cls: "bg-warn/10 text-warn",
      dot: "bg-warn",
    },
    com_analista: { text: "Em atendimento", cls: "bg-info/10 text-info", dot: "bg-info" },
    agente: { text: "Com o agent", cls: "bg-ok/10 text-ok", dot: "bg-ok" },
    encerrada: { text: "Encerrada", cls: "bg-slate-100 text-muted", dot: "bg-slate-400" },
  }[item.status];
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${pill.cls}`}
    >
      <span className={`size-1.5 rounded-full ${pill.dot}`} /> {pill.text}
    </span>
  );
}

function ConversationHeader({
  item,
  me,
  busy,
  onAct,
}: {
  item: InboxItem;
  me: Person;
  busy: string | null;
  onAct: (op: AnalystActionBody["op"]) => void;
}) {
  const mine = item.status === "com_analista" && item.analyst?.id === me.id;
  const subtitle = [item.employee.department, item.handoff?.ticketId].filter(Boolean).join(" · ");
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white px-6">
      <Avatar name={item.employee.name} seed={item.employee.id} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{item.employee.name}</p>
        <p className="truncate text-[12px] text-muted">{subtitle}</p>
      </div>
      {mine ? (
        <div className="flex items-center gap-2">
          <ActionButton op="devolver" busy={busy} onAct={onAct} variant="outline">
            Devolver ao agent
          </ActionButton>
          <ActionButton op="encerrar" busy={busy} onAct={onAct} variant="danger">
            Encerrar atendimento
          </ActionButton>
        </div>
      ) : (
        <StatusPill item={item} />
      )}
    </header>
  );
}

const BUTTON = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  outline: "border border-line bg-white text-ink hover:bg-canvas",
  danger: "bg-danger/10 text-danger hover:bg-danger/15",
} as const;

function ActionButton({
  op,
  busy,
  onAct,
  variant,
  children,
}: {
  op: AnalystActionBody["op"];
  busy: string | null;
  onAct: (op: AnalystActionBody["op"]) => void;
  variant: keyof typeof BUTTON;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onAct(op)}
      disabled={busy !== null}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium disabled:opacity-60 ${BUTTON[variant]}`}
    >
      {busy === op && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/** Por que o agent passou a conversa: motivo, resumo e confiança. */
function Handoff({ item }: { item: InboxItem }) {
  const { handoff } = item;
  if (!handoff || (item.status !== "aguardando_analista" && item.status !== "com_analista")) {
    return null;
  }
  return (
    <div className="rounded-lg border border-warn/30 bg-white px-4 py-3 text-[13px]">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-warn uppercase">
        <ArrowLeftRight className="size-3.5" /> Transferida
        {handoff.level && ` para Suporte ${handoff.level}`}
        {handoff.at && <span className="font-normal normal-case"> · {time(handoff.at)}</span>}
      </p>
      <p className="mt-1.5">
        <span className="font-medium">Motivo:</span> {handoff.reason}
      </p>
      {handoff.summary && (
        <p className="mt-1 whitespace-pre-line text-ink-soft">
          <span className="font-medium text-ink">Resumo do agent:</span> {handoff.summary}
        </p>
      )}
      {handoff.confidence != null && (
        <p className="mt-1 text-[12px] text-muted">
          Confiança do agent na última resposta: {Math.round(handoff.confidence * 100)}%
        </p>
      )}
    </div>
  );
}

function MessageRow({
  message,
  next,
  item,
  traceOpen,
  onTrace,
}: {
  message: ChatMessage;
  next: ChatMessage | undefined;
  item: InboxItem;
  traceOpen: boolean;
  onTrace: () => void;
}) {
  if (message.role === "funcionario") {
    return (
      <div className="flex justify-start">
        <Bubble>
          <p className="whitespace-pre-line">{textOf(message)}</p>
        </Bubble>
      </div>
    );
  }

  const answer = textOf(next);
  const blocks = groupParts(message.parts).map(({ part, replies }, i) => {
    switch (part.type) {
      case "text":
        return (
          <Bubble key={i} tone={message.role === "analista" ? "analyst" : "agent"}>
            <p className="whitespace-pre-line">{part.text}</p>
            {replies && <QuickReplyOptions replies={replies} live={false} answer={answer} />}
          </Bubble>
        );
      case "quick_replies":
        return (
          <Bubble key={i} tone="agent">
            <QuickReplyOptions replies={part} live={false} answer={answer} />
          </Bubble>
        );
      case "ticket_select":
        return <TicketSelect key={i} part={part} live={false} answer={answer} />;
      case "ticket_card":
        return <TicketCard key={i} view={part.view} />;
      case "draft_card":
        return (
          <DraftCard
            key={i}
            draft={part.draft}
            state={part.state}
            actionable={false}
            busy={false}
            onConfirm={() => {}}
            onCancel={() => {}}
            onEdit={async () => false}
          />
        );
      case "system_event":
        return <SystemEvent key={i}>{part.text}</SystemEvent>;
    }
  });

  if (message.role === "sistema") {
    return (
      <SystemEvent>
        {message.parts.map((p) => (p.type === "system_event" ? p.text : "")).join(" ")}
        <span className="opacity-70">· {time(message.createdAt)}</span>
      </SystemEvent>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {message.role === "agent" ? (
        <div className={traceOpen ? "rounded bg-brand-soft px-1" : ""}>
          <DecisionChips trace={message.trace} onOpen={onTrace} />
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold">{item.analyst?.name ?? "Analista"}</span>
          {item.analyst?.supportLevel && (
            <span className="rounded bg-ok/10 px-1.5 py-px font-medium text-ok">
              Suporte {item.analyst.supportLevel}
            </span>
          )}
        </p>
      )}
      {blocks}
    </div>
  );
}

function Composer({
  item,
  me,
  dueAt,
  busy,
  error,
  text,
  onText,
  onReply,
  onAct,
}: {
  item: InboxItem;
  me: Person;
  dueAt: string | null;
  busy: string | null;
  error: string | null;
  text: string;
  onText: (t: string) => void;
  onReply: () => void;
  onAct: (op: AnalystActionBody["op"]) => void;
}) {
  const name = firstName(item.employee.name);
  const mine = item.status === "com_analista" && item.analyst?.id === me.id;

  let bar: React.ReactNode = null;
  if (item.status === "aguardando_analista") {
    const since = item.handoff?.at ? minutesSince(item.handoff.at) : null;
    bar = (
      <Bar
        tone="warn"
        icon={<Hand className="size-4 text-warn" />}
        actions={
          <>
            <ActionButton op="devolver" busy={busy} onAct={onAct} variant="outline">
              Devolver ao agent
            </ActionButton>
            <ActionButton op="assumir" busy={busy} onAct={onAct} variant="primary">
              Assumir atendimento
            </ActionButton>
          </>
        }
      >
        <strong className="font-semibold">{name} espera um atendente</strong> · Agent pausado
        {since ? ` · ${since}` : ""}
        {dueAt && ` · prazo do chamado: ${time(dueAt)}`}
      </Bar>
    );
  } else if (item.status === "agente") {
    bar = (
      <Bar
        tone="ok"
        icon={<span className="size-2 rounded-full bg-ok" />}
        actions={
          <ActionButton op="assumir" busy={busy} onAct={onAct} variant="outline">
            Assumir atendimento
          </ActionButton>
        }
      >
        O agent está atendendo {name}. Você pode assumir a qualquer momento.
      </Bar>
    );
  } else if (item.status === "com_analista" && !mine) {
    bar = (
      <Bar tone="info" icon={<Headset className="size-4 text-info" />}>
        {item.analyst?.name ?? "Outro analista"} está atendendo esta conversa.
      </Bar>
    );
  } else if (item.status === "encerrada") {
    bar = (
      <Bar tone="muted" icon={null}>
        Conversa encerrada.
      </Bar>
    );
  }

  return (
    <footer className="border-t border-line bg-white px-6 py-3">
      <div className="mx-auto max-w-[720px] space-y-2">
        {error && (
          <p role="alert" className="rounded-lg bg-danger/5 px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        {bar}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onReply();
          }}
          className="flex items-end gap-2 rounded-lg border border-line bg-white py-1.5 pr-1.5 pl-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15 has-[:disabled]:bg-canvas"
        >
          <textarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onReply();
              }
            }}
            disabled={!mine}
            rows={1}
            maxLength={2000}
            aria-label="Resposta"
            placeholder={
              mine
                ? `Escreva para ${name}…`
                : item.status === "encerrada"
                  ? "Conversa encerrada"
                  : "Assuma o atendimento para responder"
            }
            className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] outline-none disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!mine || busy !== null || !text.trim()}
            aria-label="Enviar"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-hover disabled:opacity-40"
          >
            {busy === "enviar" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </form>
      </div>
    </footer>
  );
}

function Bar({
  tone,
  icon,
  actions,
  children,
}: {
  tone: "warn" | "ok" | "info" | "muted";
  icon: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls = {
    warn: "bg-warn/10 text-ink",
    ok: "bg-ok/10 text-ink",
    info: "bg-info/10 text-ink",
    muted: "bg-canvas text-muted",
  }[tone];
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px] ${cls}`}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span>{children}</span>
      </span>
      {actions && <span className="flex gap-2">{actions}</span>}
    </div>
  );
}

function focusedTicket(detail: ConsoleDetail): TicketView | null {
  const id = detail.item.handoff?.ticketId;
  return (id && detail.tickets?.find((v) => v.ticket.id === id)) || null;
}

function TicketsPanel({ detail }: { detail: ConsoleDetail }) {
  const { item, tickets } = detail;
  const name = firstName(item.employee.name);
  const focused = focusedTicket(detail);
  const others = (tickets ?? []).filter((v) => v.ticket.id !== focused?.ticket.id);
  const open = (tickets ?? []).filter((v) => OPEN_STATUSES.includes(v.ticket.status)).length;
  const closed = (tickets ?? []).length - open;

  return (
    <aside className="hidden w-[320px] shrink-0 xl:flex flex-col border-l border-line bg-white">
      <header className="flex h-16 shrink-0 flex-col justify-center border-b border-line px-5">
        <p className="text-[14px] font-semibold">Chamados de {name}</p>
        {tickets && (
          <p className="text-[12px] text-muted">
            {open} {open === 1 ? "aberto" : "abertos"} · {closed}{" "}
            {closed === 1 ? "encerrado" : "encerrados"}
          </p>
        )}
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {tickets === null && (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-[12px] text-ink-soft">
            O sistema de chamados não respondeu. A lista volta na próxima atualização.
          </p>
        )}

        {focused && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
              Desta conversa
            </h3>
            <div className="rounded-lg border border-line px-3.5 py-3">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-muted">{focused.ticket.id}</span>
                <StatusDot status={focused.ticket.status} className="font-medium" />
              </div>
              <p className="mt-1 text-[13px] leading-snug font-semibold">{focused.ticket.title}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                {focused.ticket.category} · <PriorityTag priority={focused.ticket.priority} />
              </p>
              {focused.sla.overdue && (
                <p className="mt-1 text-[12px] font-medium text-danger">Prazo vencido</p>
              )}
              {item.status === "com_analista" && item.analyst && (
                <p className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[12px] text-ink-soft">
                  <Headset className="size-3.5 text-info" /> Assumido por {item.analyst.name}
                </p>
              )}
              {item.status === "aguardando_analista" && (
                <p className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[12px] text-ink-soft">
                  <ArrowLeftRight className="size-3.5 text-warn" /> Transferido para um analista
                  {item.handoff?.at && ` · ${time(item.handoff.at)}`}
                </p>
              )}
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
              {focused ? "Outros chamados" : "Chamados"}
            </h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {others.map(({ ticket, sla }) => {
                const isOpen = OPEN_STATUSES.includes(ticket.status);
                return (
                  <li key={ticket.id} className="px-3.5 py-2.5">
                    <p className="truncate text-[13px] font-medium">{ticket.title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                      {ticket.id} ·{" "}
                      {isOpen || !ticket.resolvedAt ? (
                        <StatusDot status={ticket.status} />
                      ) : (
                        `${ticket.status} em ${formatShortDate(ticket.resolvedAt)}`
                      )}
                      {sla.overdue && <span className="font-medium text-danger">· vencido</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {tickets?.length === 0 && (
          <p className="text-[13px] text-muted">{name} não tem chamados.</p>
        )}
      </div>
    </aside>
  );
}
