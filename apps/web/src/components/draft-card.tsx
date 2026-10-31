"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDue, TICKET_CATEGORIES, type TicketCategory, type TicketDraft } from "@nexo/shared";
import { AFFECTED_LABEL, Field, PriorityTag } from "@/components/tickets";

type State = "pendente" | "confirmado" | "cancelado";

export interface DraftEdit {
  title: string;
  description: string;
  category: TicketCategory;
}

const STATE_LABEL: Record<State, { text: string; tone: string }> = {
  pendente: { text: "Aguardando confirmação", tone: "text-warn bg-warn" },
  confirmado: { text: "Confirmado", tone: "text-ok bg-ok" },
  cancelado: { text: "Cancelado", tone: "text-muted bg-slate-400" },
};

function kind(draft: TicketDraft): string {
  if (draft.action === "update") return `Complemento do ${draft.targetTicketId}`;
  if (draft.action === "reopen") return `Reabertura do ${draft.targetTicketId}`;
  return draft.type === "INC" ? "Novo chamado" : "Nova requisição";
}

const input =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

export function DraftCard({
  draft,
  state,
  actionable,
  busy,
  onConfirm,
  onCancel,
  onEdit,
}: {
  draft: TicketDraft;
  state: State;
  actionable: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: (edit: DraftEdit) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DraftEdit>({
    title: draft.title,
    description: draft.description,
    category: draft.category,
  });
  const [shortcut, setShortcut] = useState("Ctrl ↵");
  const isNew = draft.action === "create";
  const live = state === "pendente" && actionable;
  const due = draft.sla.dueAt ? formatDue(new Date(draft.sla.dueAt), new Date()) : null;
  const [stateText, stateTone] = [STATE_LABEL[state].text, STATE_LABEL[state].tone.split(" ")];

  // ⌘↵ / Ctrl+↵ confirma o rascunho pendente, como no protótipo.
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setShortcut("⌘↵");
    if (!live || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live, editing, busy, onConfirm]);

  return (
    <div
      className={`w-full overflow-hidden rounded-lg border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${
        state === "pendente" ? "border-line" : "border-line opacity-75"
      }`}
    >
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="text-muted">
            {kind(draft)} <span className="mx-1">·</span> Rascunho {draft.id}
          </span>
          <span className={`inline-flex items-center gap-1.5 font-medium ${stateTone[0]}`}>
            <span className={`size-1.5 rounded-full ${stateTone[1]}`} />
            {stateText}
          </span>
        </div>

        {editing ? (
          <form
            id={`edit-${draft.id}`}
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await onEdit(form)) setEditing(false);
            }}
          >
            {isNew && (
              <label className="block text-[11px] text-muted">
                Título
                <input
                  className={`${input} mt-1`}
                  value={form.title}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
            )}
            <label className="block text-[11px] text-muted">
              {isNew ? "Descrição" : "Informação a adicionar"}
              <textarea
                className={`${input} mt-1 min-h-24 resize-y`}
                value={form.description}
                maxLength={2000}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            {isNew && (
              <label className="block text-[11px] text-muted">
                Categoria
                <select
                  className={`${input} mt-1`}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as TicketCategory })}
                >
                  {TICKET_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-[11px] text-muted">
              A prioridade e o prazo seguem as regras do service desk e não mudam na edição.
            </p>
          </form>
        ) : (
          <>
            <p className="mt-1.5 text-[16px] font-semibold leading-snug">{draft.title}</p>
            <p className="mt-1 text-[12px] leading-relaxed whitespace-pre-line text-muted">
              {draft.description}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
              <Field label="Categoria">{draft.category}</Field>
              <Field label="Prioridade">
                <PriorityTag priority={draft.priority} />
                {due && <span className="font-normal text-muted"> · resposta até {due}</span>}
              </Field>
              <Field label="Afetados">{AFFECTED_LABEL[draft.affected]}</Field>
            </dl>
            <p className="mt-2 text-[11px] text-muted">{draft.priorityReason}</p>
          </>
        )}
      </div>

      {live && (
        <div className="flex items-center gap-2 border-t border-line bg-canvas px-3 py-2.5">
          {editing ? (
            <>
              <button
                type="submit"
                form={`edit-${draft.id}`}
                disabled={busy}
                className="rounded-md bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md px-3 py-1.5 text-[13px] text-ink-soft hover:bg-white"
              >
                Voltar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Confirmar
                <kbd className="rounded bg-white/20 px-1 py-px font-sans text-[10px]">
                  {shortcut}
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className="rounded-md border border-line bg-white px-3 py-1.5 text-[13px] text-ink hover:bg-canvas disabled:opacity-60"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-[13px] text-ink-soft hover:bg-white disabled:opacity-60"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
