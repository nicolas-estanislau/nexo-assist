import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Ticket, TicketWithUpdates } from "@nexo/shared";
import { createApp, type AppDeps } from "./app";
import { openDb } from "./db/client";
import { seedIfEmpty } from "./seed";

const TOKEN = "token-de-teste-com-tamanho-ok";
const NOW = new Date("2026-10-29T10:00:00-03:00");

const cleanups: (() => void)[] = [];
let app: ReturnType<typeof createApp>;

async function setup(overrides: Partial<AppDeps> = {}) {
  // Banco em arquivo temporário: o libsql em memória não compartilha estado entre transações.
  const dir = mkdtempSync(join(tmpdir(), "tickets-api-"));
  const { db, client } = await openDb(`file:${join(dir, "test.db")}`);
  cleanups.push(() => {
    client.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // No Windows o arquivo pode seguir travado por instantes; é só um temporário.
    }
  });
  await seedIfEmpty(db, NOW);
  app = createApp({ db, token: TOKEN, chaos: null, now: () => NOW, ...overrides });
}

function call(path: string, init: RequestInit & { actor?: string; key?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${TOKEN}`);
  if (init.actor) headers.set("X-Actor-Id", init.actor);
  if (init.key) headers.set("Idempotency-Key", init.key);
  if (init.body) headers.set("Content-Type", "application/json");
  return app.request(path, { ...init, headers });
}

const newTicket = {
  type: "INC",
  title: "VPN não conecta — erro 809",
  description: "Desde ontem o notebook com Windows 11 não conecta na VPN, erro 809.",
  category: "Rede e VPN",
  priority: "Alta",
  affected: "individual",
};

beforeEach(() => setup());
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("autenticação", () => {
  it("exige o token compartilhado", async () => {
    const res = await app.request("/tickets", { headers: { "X-Actor-Id": "ana.souza" } });
    expect(res.status).toBe(401);
  });

  it("exige saber em nome de quem é a chamada", async () => {
    const res = await call("/tickets");
    expect(res.status).toBe(401);
  });

  it("libera o health check sem token", async () => {
    expect((await app.request("/health")).status).toBe(200);
  });
});

describe("privacidade", () => {
  it("lista só os chamados do próprio funcionário", async () => {
    const res = await call("/tickets", { actor: "ana.souza" });
    const { tickets } = (await res.json()) as { tickets: Ticket[] };
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every((t) => t.requesterId === "ana.souza")).toBe(true);
  });

  it("não deixa um funcionário listar os chamados de outro", async () => {
    const res = await call("/tickets?requesterId=bruno.tavares", { actor: "ana.souza" });
    expect(res.status).toBe(403);
  });

  it("responde 404 para chamado de outra pessoa, sem revelar que existe", async () => {
    const res = await call("/tickets/INC-20402", { actor: "ana.souza" });
    expect(res.status).toBe(404);
  });

  it("deixa o analista ver qualquer chamado", async () => {
    const res = await call("/tickets/INC-20402", { actor: "rafael.lima" });
    expect(res.status).toBe(200);
  });
});

describe("chamados", () => {
  it("filtra os abertos", async () => {
    const res = await call("/tickets?scope=open", { actor: "ana.souza" });
    const { tickets } = (await res.json()) as { tickets: Ticket[] };
    expect(tickets.map((t) => t.id).sort()).toEqual(["INC-20298", "INC-20311", "REQ-10442"]);
  });

  it("cria um chamado com número sequencial e histórico", async () => {
    const res = await call("/tickets", {
      method: "POST",
      actor: "ana.souza",
      body: JSON.stringify(newTicket),
    });
    expect(res.status).toBe(201);
    const ticket = (await res.json()) as Ticket;
    expect(ticket).toMatchObject({ id: "INC-20600", status: "Aberto", requesterId: "ana.souza" });

    const detail = (await (
      await call(`/tickets/${ticket.id}`, { actor: "ana.souza" })
    ).json()) as TicketWithUpdates;
    expect(detail.updates[0]?.kind).toBe("criacao");
  });

  it("não duplica o chamado quando o mesmo pedido chega de novo (retry)", async () => {
    const init = {
      method: "POST",
      actor: "ana.souza",
      key: "abc-123",
      body: JSON.stringify(newTicket),
    };
    const first = (await (await call("/tickets", init)).json()) as Ticket;
    const retry = await call("/tickets", init);
    expect(retry.headers.get("Idempotent-Replay")).toBe("true");
    expect(((await retry.json()) as Ticket).id).toBe(first.id);

    const { tickets } = (await (await call("/tickets", { actor: "ana.souza" })).json()) as {
      tickets: Ticket[];
    };
    expect(tickets.filter((t) => t.title === newTicket.title)).toHaveLength(1);
  });

  it("valida o corpo da requisição", async () => {
    const res = await call("/tickets", {
      method: "POST",
      actor: "ana.souza",
      body: JSON.stringify({ ...newTicket, category: "RH" }),
    });
    expect(res.status).toBe(400);
  });

  it("complementa um chamado aberto sem reiniciar o prazo", async () => {
    const res = await call("/tickets/INC-20311/updates", {
      method: "POST",
      actor: "ana.souza",
      body: JSON.stringify({ message: "Agora também trava ao abrir o Excel." }),
    });
    const { ticket, updates } = (await res.json()) as TicketWithUpdates;
    expect(updates.at(-1)).toMatchObject({ kind: "comentario", authorId: "ana.souza" });
    expect(new Date(ticket.updatedAt) < NOW).toBe(true);
  });

  it("reabre um chamado resolvido há 4 dias", async () => {
    const res = await call("/tickets/INC-20150/reopen", {
      method: "POST",
      actor: "ana.souza",
      body: JSON.stringify({ reason: "A senha bloqueou de novo." }),
    });
    expect(res.status).toBe(200);
    const { ticket } = (await res.json()) as TicketWithUpdates;
    expect(ticket).toMatchObject({ status: "Aberto", resolvedAt: null });
  });

  it("recusa reabrir um chamado resolvido há mais de 7 dias", async () => {
    const res = await call("/tickets/INC-19877/reopen", {
      method: "POST",
      actor: "ana.souza",
      body: JSON.stringify({ reason: "Voltou a acontecer." }),
    });
    expect(res.status).toBe(409);
  });

  it("transfere para um analista com o resumo do caso", async () => {
    const res = await call("/tickets/INC-20311/transfer", {
      method: "POST",
      actor: "ana.souza",
      body: JSON.stringify({
        level: "N2",
        summary: "Parado há 5 dias; funcionária pediu analista.",
      }),
    });
    const { ticket, updates } = (await res.json()) as TicketWithUpdates;
    expect(ticket).toMatchObject({ status: "Aguardando analista", supportLevel: "N2" });
    expect(updates.at(-1)?.message).toContain("Suporte N2");
  });

  it("só analistas alteram status e prioridade", async () => {
    const body = JSON.stringify({ status: "Em atendimento" });
    expect(
      (await call("/tickets/INC-20311", { method: "PATCH", actor: "ana.souza", body })).status,
    ).toBe(403);
    const res = await call("/tickets/INC-20311", { method: "PATCH", actor: "rafael.lima", body });
    expect(((await res.json()) as TicketWithUpdates).ticket.status).toBe("Em atendimento");
  });
});

describe("central de ajuda", () => {
  it("encontra o artigo do erro 809", async () => {
    const res = await call("/kb/search?q=vpn%20erro%20809");
    const { results } = (await res.json()) as { results: { article: { id: string } }[] };
    expect(results[0]?.article.id).toBe("KB-001");
  });

  it("não devolve nada para assuntos sem artigo", async () => {
    const res = await call("/kb/search?q=reembolso%20de%20viagem");
    expect(((await res.json()) as { results: unknown[] }).results).toEqual([]);
  });
});

describe("sistema legado instável", () => {
  it("fica fora do ar por alguns segundos e depois volta", async () => {
    let clock = 0;
    let shouldFail = true;
    await setup({
      chaos: {
        failureRate: 0.5,
        outageMs: 3000,
        latencyMs: 0,
        random: () => (shouldFail ? 0 : 1),
        now: () => clock,
      },
    });

    const down = await call("/tickets", { actor: "ana.souza" });
    expect(down.status).toBe(503);
    expect(down.headers.get("Retry-After")).toBe("3");

    shouldFail = false;
    clock = 1000;
    expect((await call("/tickets", { actor: "ana.souza" })).status).toBe(503);

    clock = 3000;
    expect((await call("/tickets", { actor: "ana.souza" })).status).toBe(200);
  });

  it("não afeta a central de ajuda", async () => {
    await setup({ chaos: { failureRate: 1, outageMs: 3000, latencyMs: 0 } });
    expect((await call("/kb/search?q=vpn")).status).toBe(200);
  });
});
