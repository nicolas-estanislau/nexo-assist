"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useState } from "react";
import { formatDue, TICKET_CATEGORIES, type TicketCategory, type TicketDraft } from "@nexo/shared";
import { AFFECTED_LABEL, PriorityTag } from "@/components/tickets";

type State = "pendente" | "confirmado" | "cancelado";

export interface DraftEdit {
  title: string;
  description: string;
  category: TicketCategory;
}

function heading(draft: TicketDraft): string {
  if (draft.action === "update") return `Complemento do ${draft.targetTicketId}`;
  if (draft.action === "reopen") return `Reabertura do ${draft.targetTicketId}`;
  return draft.type === "INC" ? "Novo chamado · Incidente" : "Novo chamado · Requisição";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px]">{children}</dd>
    </div>
  );
}

const input =
  "w-full rounded-lg border border-line px-3 py-2 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

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
  const isNew = draft.action === "create";
  const due = draft.sla.dueAt ? formatDue(new Date(draft.sla.dueAt), new Date()) : null;

  return (
    <div
      className={`w-full max-w-md rounded-xl border bg-white ${
        state === "pendente" ? "border-brand/40 shadow-sm" : "border-line opacity-80"
      }`}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="text-[12px] font-semibold text-brand">{heading(draft)}</p>
        {state !== "pendente" && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              state === "confirmado" ? "bg-ok/10 text-ok" : "bg-slate-100 text-muted"
            }`}
          >
            {state === "confirmado" ? "Confirmado" : "Cancelado"}
          </span>
        )}
      </div>

      {editing ? (
        <form
          className="space-y-3 p-4"
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
                className={`${input} mt-1 bg-white`}
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
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-[13px] text-ink-soft hover:bg-canvas"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              Salvar
            </button>
          </div>
        </form>
      ) : (
        <div className="p-4">
          <p className="text-[14px] font-medium leading-snug">{draft.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-ink-soft">
            {draft.description}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <Field label="Categoria">{draft.category}</Field>
            <Field label="Prioridade">
              <PriorityTag priority={draft.priority} />
            </Field>
            <Field label="Quem é afetado">{AFFECTED_LABEL[draft.affected]}</Field>
            <Field label="Primeira resposta">
              {draft.sla.label}
              {due && <span className="text-muted"> · até {due}</span>}
            </Field>
          </dl>
          <p className="mt-2 text-[11px] text-muted">{draft.priorityReason}</p>

          {state === "pendente" && actionable && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-[13px] text-ink-soft hover:bg-canvas disabled:opacity-60"
              >
                <Pencil className="size-3.5" /> Editar
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] text-muted hover:bg-canvas hover:text-ink disabled:opacity-60"
              >
                <X className="size-3.5" /> Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
