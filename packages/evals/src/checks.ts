import { partsToText, type TurnResult } from "@nexo/agent";
import type { MessagePart, SupportLevel, TicketDraft } from "@nexo/shared";

// Verificações sobre o resultado de um turno. Olham para o que o funcionário recebe (partes da
// mensagem), para o que foi feito (rascunho, transferência) e para as regras registradas no
// trace, não para o texto livre do modelo: assim o resultado não depende de como ele escreve.

export interface Check {
  label: string;
  test: (result: TurnResult) => boolean;
}

type Draft = Extract<MessagePart, { type: "draft_card" }>["draft"];

export function draftOf(result: TurnResult): Draft | null {
  const part = result.parts.find((p) => p.type === "draft_card");
  return part?.type === "draft_card" ? part.draft : null;
}

export const textOf = (result: TurnResult) => partsToText(result.parts);

export const hasPart = (type: MessagePart["type"]): Check => ({
  label: `mostra ${type}`,
  test: (r) => r.parts.some((p) => p.type === type),
});

export const noPart = (type: MessagePart["type"]): Check => ({
  label: `não mostra ${type}`,
  test: (r) => !r.parts.some((p) => p.type === type),
});

export const noDraft: Check = { label: "não propõe chamado", test: (r) => draftOf(r) === null };

export function draft(
  expected: Partial<Pick<TicketDraft, "action" | "targetTicketId" | "type" | "priority">>,
): Check {
  const label = Object.entries(expected)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
  return {
    label: `rascunho ${label}`,
    test: (r) => {
      const d = draftOf(r);
      return (
        d !== null &&
        Object.entries(expected).every(([k, v]) => d[k as keyof typeof expected] === v)
      );
    },
  };
}

export const rule = (fragment: string): Check => ({
  label: `regra "${fragment}"`,
  test: (r) => r.trace.rulesApplied.some((x) => x.includes(fragment)),
});

export const noRule = (fragment: string): Check => ({
  label: `sem a regra "${fragment}"`,
  test: (r) => !r.trace.rulesApplied.some((x) => x.includes(fragment)),
});

export const transfer = (level?: SupportLevel): Check => ({
  label: level ? `transfere ao Suporte ${level}` : "transfere a um analista",
  test: (r) => r.transfer !== null && (!level || r.transfer.level === level),
});

export const noTransfer: Check = { label: "não transfere", test: (r) => r.transfer === null };

export const intent = (...intents: string[]): Check => ({
  label: `intenção ${intents.join(" ou ")}`,
  test: (r) => intents.includes(r.trace.understood.intent),
});

export const textExcludes = (pattern: RegExp, label: string): Check => ({
  label,
  test: (r) => !pattern.test(textOf(r)),
});

export const asksQuestion: Check = {
  label: "faz uma pergunta",
  test: (r) => textOf(r).includes("?"),
};

/** Passa se qualquer uma passar: para casos em que mais de um caminho é aceitável. */
export const either = (...checks: Check[]): Check => ({
  label: checks.map((c) => c.label).join(" | "),
  test: (r) => checks.some((c) => c.test(r)),
});
