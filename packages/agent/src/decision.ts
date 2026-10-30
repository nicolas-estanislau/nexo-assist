import { z } from "zod";
import { AffectedScope, TicketCategory, TicketType } from "@nexo/shared";

// O que o LLM devolve a cada mensagem: a interpretação e a ação que ele sugere.
// Formato plano (sem uniões) para ser aceito como saída estruturada por qualquer provedor.
// Ele NÃO decide prioridade, prazo, duplicidade nem transferência: isso é do código (policy.ts).

export const INTENTS = [
  "duvida",
  "consultar_chamado",
  "complementar_chamado",
  "abrir_chamado",
  "falar_com_analista",
  "fora_de_escopo",
  "conversa",
  "outro",
] as const;
export type Intent = (typeof INTENTS)[number];

export const ACTIONS = [
  "responder",
  "perguntar",
  "listar_chamados",
  "mostrar_chamado",
  "propor_chamado",
  "propor_complemento",
  "transferir",
  "redirecionar",
] as const;
export type Action = (typeof ACTIONS)[number];

export const DraftFacts = z.object({
  type: TicketType.describe(
    "INC se algo parou ou não funciona; REQ se é pedido de acesso, equipamento ou software",
  ),
  category: TicketCategory,
  title: z.string().describe("Título curto e específico, até 80 caracteres"),
  description: z
    .string()
    .describe(
      "Descrição completa para o analista não precisar perguntar de novo: o que acontece, desde quando, o que já foi tentado, equipamento/sistema",
    ),
  affected: AffectedScope.nullable().describe(
    "Quem é afetado. null se o funcionário ainda não disse",
  ),
  workBlocked: z.boolean().describe("O problema impede de trabalhar, sem alternativa"),
  sameDayCommitment: z.boolean().describe("Há compromisso no mesmo dia que depende da solução"),
});
export type DraftFacts = z.infer<typeof DraftFacts>;

export const TurnDecision = z.object({
  intent: z.enum(INTENTS),
  summary: z.string().describe("O que o funcionário quer, em uma frase"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confiança de 0 a 1 de que entendeu o pedido e escolheu a ação certa"),
  rationale: z.string().describe("Por que esta ação, citando a regra ou o artigo usado"),
  action: z.enum(ACTIONS),
  reply: z.string().describe("Mensagem ao funcionário, em português, curta, sem markdown"),
  options: z.array(z.string()).describe("Opções rápidas quando action=perguntar (até 4); senão []"),
  ticketId: z.string().nullable().describe("Chamado em foco (mostrar, complementar, transferir)"),
  ticketIds: z.array(z.string()).describe("Chamados a listar quando action=listar_chamados"),
  articleId: z.string().nullable().describe("Artigo da central de ajuda usado, se houver"),
  draft: DraftFacts.nullable().describe("Fatos do novo chamado quando action=propor_chamado"),
  complement: z.string().nullable().describe("Informação nova quando action=propor_complemento"),
  userAskedForHuman: z.boolean().describe("O funcionário pediu para falar com uma pessoa"),
});
export type TurnDecision = z.infer<typeof TurnDecision>;
