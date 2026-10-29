import type { AffectedScope, TicketPriority, TicketType } from "@nexo/shared";

// Prioridade = impacto (quantas pessoas) × urgência (trabalho parado, compromisso em risco).
// O LLM extrai os fatos da conversa; a regra é aplicada aqui, de forma determinística.

export interface PriorityInput {
  type: TicketType;
  affected: AffectedScope;
  /** O problema impede de trabalhar (não há alternativa). */
  workBlocked: boolean;
  /** Há um compromisso no mesmo dia que depende da solução. */
  sameDayCommitment: boolean;
}

export interface PriorityDecision {
  priority: TicketPriority;
  /** Explicação legível da regra aplicada; vai para o trace de decisão. */
  reason: string;
}

const AFFECTED_LABEL: Record<AffectedScope, string> = {
  individual: "uma pessoa",
  equipe: "uma equipe",
  empresa: "a empresa",
};

export function classifyPriority(input: PriorityInput): PriorityDecision {
  const who = AFFECTED_LABEL[input.affected];

  if (input.workBlocked && input.affected !== "individual") {
    return { priority: "Crítica", reason: `Algo parado para ${who}.` };
  }
  if (input.workBlocked) {
    return { priority: "Alta", reason: "Impede uma pessoa de trabalhar." };
  }
  if (input.sameDayCommitment) {
    return { priority: "Alta", reason: `Afeta ${who} e há um compromisso no mesmo dia.` };
  }
  if (input.type === "REQ") {
    return { priority: "Baixa", reason: "Pedido sem urgência." };
  }
  return { priority: "Média", reason: `Atrapalha ${who}, mas há alternativa.` };
}
