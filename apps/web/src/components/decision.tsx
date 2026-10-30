"use client";

import { AlertTriangle, Check, ChevronRight, Loader2, X } from "lucide-react";
import type { DecisionTrace } from "@nexo/shared";

// Visibilidade das decisões: chips acima de cada resposta e o painel "por que o agent fez isso".

type Action = DecisionTrace["actions"][number];

const INTENT_LABEL: Record<string, string> = {
  duvida: "Dúvida",
  consultar_chamado: "Consultar chamado",
  complementar_chamado: "Complementar chamado",
  abrir_chamado: "Abrir chamado",
  falar_com_analista: "Falar com analista",
  fora_de_escopo: "Fora do escopo de TI",
  conversa: "Conversa",
  outro: "Outro",
  confirmar_rascunho: "Confirmar rascunho",
  desconhecida: "Não interpretada",
};

export function confidenceTone(confidence: number): string {
  if (confidence >= 0.8) return "text-ok";
  if (confidence >= 0.6) return "text-warn";
  return "text-danger";
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Ações repetidas (ex.: dois "calculou o prazo") viram um chip só. */
function uniqueActions(actions: readonly Action[]): Action[] {
  const seen = new Map<string, Action>();
  for (const action of actions) {
    const previous = seen.get(action.label);
    if (!previous || action.status === "erro") seen.set(action.label, action);
  }
  return [...seen.values()];
}

function ActionChip({ action }: { action: Action }) {
  const failed = action.status === "erro";
  return (
    <span className={`inline-flex items-center gap-1 ${failed ? "text-danger" : ""}`}>
      {failed ? <AlertTriangle className="size-3" /> : <Check className="size-3" />}
      {action.label}
      {action.attempts > 1 && <span className="text-warn">({action.attempts} tentativas)</span>}
    </span>
  );
}

/** Linha "Nexo Assist ✓ consultou seus chamados ✓ buscou na central de ajuda", como no protótipo. */
export function DecisionChips({
  trace,
  live,
  onOpen,
}: {
  trace: DecisionTrace | null;
  /** Ações do turno ainda em andamento. */
  live?: { actions: readonly Action[]; thinking: boolean };
  onOpen?: () => void;
}) {
  const actions = uniqueActions(trace?.actions ?? live?.actions ?? []);
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
      <span className="font-semibold text-ink">Nexo Assist</span>
      {actions.map((action) => (
        <ActionChip key={`${action.tool}-${action.label}`} action={action} />
      ))}
      {live?.thinking && !trace && (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" /> analisando sua mensagem…
        </span>
      )}
      {trace && onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-0.5 rounded px-1 hover:bg-canvas hover:text-ink"
        >
          <span className={`font-medium ${confidenceTone(trace.confidence)}`}>
            confiança {percent(trace.confidence)}
          </span>
          <span className="mx-0.5">·</span>por quê? <ChevronRight className="size-3" />
        </button>
      )}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function DecisionPanel({ trace, onClose }: { trace: DecisionTrace; onClose: () => void }) {
  const entities = Object.entries(trace.understood.entities);
  return (
    <aside
      aria-label="Detalhes da decisão"
      className="flex w-[360px] shrink-0 flex-col border-l border-line bg-white"
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
        <p className="text-[14px] font-semibold">Por que o assistente fez isso</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-md p-1 text-muted hover:bg-canvas hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto text-[13px]">
        <Section title="O que entendeu">
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
            {INTENT_LABEL[trace.understood.intent] ?? trace.understood.intent}
          </span>
          <p className="mt-2 leading-relaxed">{trace.understood.summary}</p>
          {entities.length > 0 && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              {entities.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted">{key}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>

        <Section title="O que fez">
          <ol className="space-y-2.5">
            {trace.actions.map((action, i) => (
              <li key={i} className="flex gap-2">
                {action.status === "ok" ? (
                  <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" />
                )}
                <div className="min-w-0">
                  <p>
                    {action.label}
                    {action.attempts > 1 && (
                      <span className="text-warn"> · {action.attempts} tentativas</span>
                    )}
                  </p>
                  {action.detail && (
                    <p className="text-[12px] break-words text-muted">{action.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {trace.rulesApplied.length > 0 && (
          <Section title="Regras aplicadas">
            <ul className="list-disc space-y-1 pl-4">
              {trace.rulesApplied.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Confiança">
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-canvas">
              <div
                className={`h-full rounded-full ${trace.confidence >= 0.8 ? "bg-ok" : trace.confidence >= 0.6 ? "bg-warn" : "bg-danger"}`}
                style={{ width: percent(trace.confidence) }}
              />
            </div>
            <span className={`font-semibold ${confidenceTone(trace.confidence)}`}>
              {percent(trace.confidence)}
            </span>
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            Abaixo de 60%, o assistente não decide sozinho e chama um analista.
          </p>
        </Section>

        <Section title="Por quê">
          <p className="leading-relaxed">{trace.rationale}</p>
        </Section>
      </div>

      <footer className="border-t border-line px-5 py-3 text-[11px] text-muted">
        {trace.model ? trace.model : "Sem LLM (executado pelas regras)"}
        {trace.usage && ` · ${trace.usage.inputTokens + trace.usage.outputTokens} tokens`}
        {` · ${(trace.latencyMs / 1000).toFixed(1)} s`}
      </footer>
    </aside>
  );
}
