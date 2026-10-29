import { OPEN_STATUSES, type Ticket, type TicketCategory } from "@nexo/shared";

// Regra "sem duplicidade": antes de criar, procura um chamado do mesmo funcionário sobre o
// mesmo problema. Aberto → atualiza; resolvido há até 7 dias → reabre.
// A similaridade aqui é léxica e barata (sem chamada ao LLM); o agent mostra os candidatos
// ao funcionário, que confirma se é o mesmo problema.

export const REOPEN_WINDOW_DAYS = 7;
export const DUPLICATE_THRESHOLD = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

// prettier-ignore
const STOPWORDS = new Set([
  "que", "não", "nao", "com", "para", "por", "uma", "um", "dos", "das", "nos", "nas", "meu",
  "minha", "meus", "minhas", "está", "esta", "estou", "tem", "ter", "mais", "mas", "sem", "foi",
  "ser", "como", "quando", "desde", "depois", "após", "apos", "ele", "ela", "isso", "esse",
  "essa", "aqui", "hoje", "ontem", "consigo", "funciona", "problema",
]);

export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => (t.length >= 3 || /^\d+$/.test(t)) && !STOPWORDS.has(t));
  return new Set(tokens);
}

/** Coeficiente de sobreposição: |A∩B| / min(|A|, |B|). Tolera descrições de tamanhos diferentes. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

export function canReopen(ticket: Pick<Ticket, "status" | "resolvedAt">, now: Date): boolean {
  if (ticket.status !== "Resolvido" || ticket.resolvedAt === null) return false;
  return now.getTime() - new Date(ticket.resolvedAt).getTime() <= REOPEN_WINDOW_DAYS * DAY_MS;
}

export interface NewTicketDraft {
  title: string;
  description: string;
  category: TicketCategory;
  requesterId: string;
}

export interface DuplicateCandidate {
  ticketId: string;
  action: "update" | "reopen";
  score: number;
}

export type DuplicateDecision =
  | { action: "create"; candidates: DuplicateCandidate[]; reason: string }
  | {
      action: "update" | "reopen";
      ticketId: string;
      candidates: DuplicateCandidate[];
      reason: string;
    };

export function findDuplicate(
  draft: NewTicketDraft,
  tickets: readonly Ticket[],
  now: Date,
): DuplicateDecision {
  const draftTokens = tokenize(`${draft.title} ${draft.description}`);

  const candidates: DuplicateCandidate[] = [];
  for (const ticket of tickets) {
    // Privacidade: só os chamados de quem está pedindo entram na comparação.
    if (ticket.requesterId !== draft.requesterId) continue;

    let action: DuplicateCandidate["action"];
    if (OPEN_STATUSES.includes(ticket.status)) action = "update";
    else if (canReopen(ticket, now)) action = "reopen";
    else continue;

    const textScore = overlap(draftTokens, tokenize(`${ticket.title} ${ticket.description}`));
    const categoryBonus = ticket.category === draft.category ? 0.15 : 0;
    const score = Math.min(1, textScore + categoryBonus);
    candidates.push({ ticketId: ticket.id, action, score: Math.round(score * 100) / 100 });
  }
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < DUPLICATE_THRESHOLD) {
    return {
      action: "create",
      candidates,
      reason: "Nenhum chamado aberto sobre o mesmo problema.",
    };
  }
  const reason =
    best.action === "update"
      ? `Já existe o ${best.ticketId} aberto sobre o mesmo problema; atualizar em vez de duplicar.`
      : `O ${best.ticketId} foi resolvido há menos de ${REOPEN_WINDOW_DAYS} dias; reabrir.`;
  return { action: best.action, ticketId: best.ticketId, candidates, reason };
}
