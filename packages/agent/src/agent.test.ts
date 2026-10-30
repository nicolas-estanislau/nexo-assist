import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, openDb, seedIfEmpty } from "@nexo/tickets-api";
import type { MessagePart, TicketDraft } from "@nexo/shared";
import { createTicketsClient } from "@nexo/tickets-client";
import { confirmDraft } from "./confirm";
import type { Employee } from "./context";
import type { TurnDecision } from "./decision";
import type { Interpreter } from "./interpreter";
import { runTurn, type TicketsConnection } from "./turn";

// O agent roda contra o tickets-api real (sem rede); só o LLM é trocado por uma decisão fixa.
// Assim os testes cobrem o que o código garante, independentemente do que o modelo responder.

const TOKEN = "token-de-teste-com-tamanho-ok";
const NOW = new Date("2026-10-29T10:00:00-03:00");
const ANA: Employee = { id: "ana.souza", name: "Ana Souza", department: "Financeiro" };
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function setup(options: { failTickets?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "agent-"));
  const { db, client } = await openDb(`file:${join(dir, "test.db")}`);
  cleanups.push(() => {
    client.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Arquivo temporário ainda travado no Windows; ignorar.
    }
  });
  await seedIfEmpty(db, NOW);
  const app = createApp({ db, token: TOKEN, chaos: null, now: () => NOW });
  const tickets: TicketsConnection = {
    baseUrl: "http://tickets.test",
    token: TOKEN,
    sleep: async () => {},
    fetch: async (input, init) =>
      options.failTickets && input.pathname.startsWith("/tickets")
        ? new Response(JSON.stringify({ error: { code: "unavailable", message: "fora" } }), {
            status: 503,
            headers: { "content-type": "application/json" },
          })
        : app.fetch(new Request(input, init)),
  };
  const api = createTicketsClient(tickets).as(ANA.id);
  return { tickets, api };
}

function decision(partial: Partial<TurnDecision>): TurnDecision {
  return {
    intent: "outro",
    summary: "Resumo.",
    confidence: 0.9,
    rationale: "Teste.",
    action: "responder",
    reply: "Ok.",
    options: [],
    ticketId: null,
    ticketIds: [],
    articleId: null,
    draft: null,
    complement: null,
    userAskedForHuman: false,
    ...partial,
  };
}

/** Interpretador falso: devolve a decisão dada e guarda o prompt recebido. */
function fixed(value: TurnDecision) {
  const prompts: string[] = [];
  const interpreter: Interpreter = {
    async interpret(prompt) {
      prompts.push(prompt);
      return { decision: value, model: "teste", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  return { interpreter, prompts };
}

async function turn(tickets: TicketsConnection, value: TurnDecision, message = "mensagem") {
  const fake = fixed(value);
  const result = await runTurn({
    employee: ANA,
    message,
    history: [],
    pendingDraft: null,
    tickets,
    interpreter: fake.interpreter,
    now: NOW,
  });
  return { ...result, prompt: fake.prompts[0] ?? "" };
}

function draftOf(parts: MessagePart[]): TicketDraft {
  const part = parts.find((p) => p.type === "draft_card");
  if (part?.type !== "draft_card") throw new Error("sem rascunho");
  return part.draft;
}

const types = (parts: MessagePart[]) => parts.map((p) => p.type);

const newVpnFacts: TurnDecision["draft"] = {
  type: "INC",
  category: "Rede e VPN",
  title: "VPN não conecta — erro 809",
  description: "Notebook com Windows 11 não conecta na VPN desde hoje, erro 809.",
  affected: "individual",
  workBlocked: true,
  sameDayCommitment: false,
};

describe("runTurn", () => {
  it("só passa ao modelo os chamados do próprio funcionário", async () => {
    const { tickets } = await setup();
    const { prompt, trace } = await turn(tickets, decision({ action: "responder" }));
    expect(prompt).toContain("INC-20311");
    expect(prompt).not.toContain("INC-20402"); // do Bruno
    expect(prompt).not.toContain("INC-19410"); // resolvido há mais de 7 dias
    // As duas consultas rodam em paralelo; a ordem no trace varia.
    expect(trace.actions.map((a) => a.tool).sort()).toEqual([
      "buscar_central_de_ajuda",
      "listar_chamados",
    ]);
  });

  it("propõe rascunho com prioridade calculada pelo código e não cria nada", async () => {
    const { tickets, api } = await setup();
    const before = await api.listTickets("all");
    const { parts, trace } = await turn(
      tickets,
      decision({ action: "propor_chamado", intent: "abrir_chamado", draft: newVpnFacts }),
    );
    const draft = draftOf(parts);
    expect(draft).toMatchObject({ action: "create", priority: "Alta", category: "Rede e VPN" });
    expect(draft.sla.dueAt).not.toBeNull();
    expect(trace.rulesApplied.join(" ")).toContain("confirmação");
    expect(await api.listTickets("all")).toHaveLength(before.length);
  });

  it("pergunta quem é afetado antes de propor", async () => {
    const { tickets } = await setup();
    const { parts } = await turn(
      tickets,
      decision({ action: "propor_chamado", draft: { ...newVpnFacts, affected: null } }),
    );
    expect(types(parts)).toEqual(["text", "quick_replies"]);
  });

  it("não duplica: propõe complementar o chamado aberto sobre o mesmo problema", async () => {
    const { tickets } = await setup();
    const { parts } = await turn(
      tickets,
      decision({
        action: "propor_chamado",
        draft: {
          type: "INC",
          category: "Hardware",
          title: "Notebook lento",
          description: "O notebook continua lento depois da atualização do Windows.",
          affected: "individual",
          workBlocked: false,
          sameDayCommitment: false,
        },
      }),
    );
    expect(draftOf(parts)).toMatchObject({ action: "update", targetTicketId: "INC-20311" });
  });

  it("não mostra chamado de outro funcionário", async () => {
    const { tickets } = await setup();
    const { parts, trace } = await turn(
      tickets,
      decision({ action: "mostrar_chamado", ticketId: "INC-20402" }),
    );
    expect(types(parts)).toEqual(["text", "ticket_select"]);
    expect(JSON.stringify(parts)).not.toContain("VPN cai");
    expect(trace.rulesApplied.join(" ")).toContain("Privacidade");
  });

  it("chamado vencido: mostra o card e oferece um analista", async () => {
    const { tickets } = await setup();
    const { parts, transfer } = await turn(
      tickets,
      decision({ action: "mostrar_chamado", ticketId: "INC-20311" }),
    );
    expect(types(parts)).toEqual(["ticket_card", "text", "quick_replies"]);
    expect(transfer).toBeNull();
  });

  it("transfere quando o funcionário pede, encaminhando o chamado em foco", async () => {
    const { tickets, api } = await setup();
    const { transfer, trace } = await turn(
      tickets,
      decision({ action: "transferir", userAskedForHuman: true, ticketId: "INC-20311" }),
    );
    expect(transfer).toMatchObject({ ticketId: "INC-20311", level: "N2" });
    expect(trace.actions.find((a) => a.tool === "transferir_chamado")?.status).toBe("ok");
    const { ticket } = await api.getTicket("INC-20311");
    expect(ticket.supportLevel).toBe("N2");
  });

  it("transfere com confiança baixa", async () => {
    const { tickets } = await setup();
    const { transfer } = await turn(tickets, decision({ action: "responder", confidence: 0.3 }));
    expect(transfer?.reason).toBeTruthy();
  });

  it("falha do modelo: avisa e não age", async () => {
    const { tickets } = await setup();
    const result = await runTurn({
      employee: ANA,
      message: "oi",
      history: [],
      pendingDraft: null,
      tickets,
      interpreter: {
        interpret: () => Promise.reject(new Error("timeout")),
      },
      now: NOW,
    });
    expect(result.transfer).toBeNull();
    expect(result.trace.actions.at(-1)).toMatchObject({ tool: "interpretar", status: "erro" });
  });

  it("sistema de chamados fora do ar: não age às cegas", async () => {
    const { tickets } = await setup({ failTickets: true });
    const { parts, trace } = await turn(
      tickets,
      decision({ action: "propor_chamado", draft: newVpnFacts }),
    );
    expect(types(parts)).toEqual(["text", "quick_replies"]);
    expect(trace.actions.find((a) => a.tool === "listar_chamados")?.status).toBe("erro");
  });
});

describe("confirmDraft", () => {
  it("cria o chamado confirmado", async () => {
    const { tickets, api } = await setup();
    const { parts } = await turn(
      tickets,
      decision({ action: "propor_chamado", draft: newVpnFacts }),
    );
    const result = await confirmDraft({ employee: ANA, draft: draftOf(parts), tickets, now: NOW });
    expect(result.ok).toBe(true);
    expect(result.ticket).toMatchObject({ priority: "Alta", requesterId: "ana.souza" });
    expect(result.transfer).toBeNull();
    expect((await api.listTickets("all")).map((t) => t.id)).toContain(result.ticket?.id);
  });

  it("reabre chamado resolvido há até 7 dias", async () => {
    const { tickets } = await setup();
    const { parts } = await turn(
      tickets,
      decision({
        action: "propor_complemento",
        ticketId: "INC-20150",
        complement: "A senha do SAP bloqueou de novo.",
      }),
    );
    const draft = draftOf(parts);
    expect(draft.action).toBe("reopen");
    const result = await confirmDraft({ employee: ANA, draft, tickets, now: NOW });
    expect(result.ticket?.status).not.toBe("Resolvido");
  });

  it("caso crítico chama um analista ao confirmar", async () => {
    const { tickets } = await setup();
    const { parts } = await turn(
      tickets,
      decision({
        action: "propor_chamado",
        draft: { ...newVpnFacts, affected: "empresa", title: "Ninguém acessa o ERP" },
      }),
    );
    const draft = draftOf(parts);
    expect(draft.priority).toBe("Crítica");
    const result = await confirmDraft({ employee: ANA, draft, tickets, now: NOW });
    expect(result.transfer).toMatchObject({ level: "N2" });
  });

  it("mantém o rascunho se o sistema de chamados estiver fora", async () => {
    const ok = await setup();
    const { parts } = await turn(
      ok.tickets,
      decision({ action: "propor_chamado", draft: newVpnFacts }),
    );
    const down = await setup({ failTickets: true });
    const result = await confirmDraft({
      employee: ANA,
      draft: draftOf(parts),
      tickets: down.tickets,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.trace.rulesApplied.join(" ")).toContain("rascunho mantido");
  });
});
