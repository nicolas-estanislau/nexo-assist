import type { TicketPriority } from "@nexo/shared";

// Quando envolver um analista (Anexo A). Pedido do funcionário, caso crítico e baixa
// confiança transferem direto. Chamado vencido gera uma oferta, como no protótipo
// ("Quer que eu chame um analista?"), para o funcionário decidir.

export const CONFIDENCE_THRESHOLD = 0.6;

export interface TransferInput {
  userRequested: boolean;
  priority: TicketPriority | null;
  overdue: boolean;
  /** Confiança do agent na própria interpretação, de 0 a 1. */
  confidence: number;
}

export interface TransferDecision {
  decision: "transfer" | "offer" | "none";
  reasons: string[];
}

export function decideTransfer(input: TransferInput): TransferDecision {
  const reasons: string[] = [];
  if (input.userRequested) reasons.push("O funcionário pediu para falar com um analista.");
  if (input.priority === "Crítica") reasons.push("Caso crítico.");
  if (input.confidence < CONFIDENCE_THRESHOLD) {
    reasons.push(`Confiança baixa (${Math.round(input.confidence * 100)}%).`);
  }
  if (reasons.length > 0) return { decision: "transfer", reasons };

  if (input.overdue) return { decision: "offer", reasons: ["Chamado com prazo vencido."] };
  return { decision: "none", reasons: [] };
}
