import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, openDb, seedIfEmpty, type AppDeps } from "@nexo/tickets-api";
import {
  createTicketsClient,
  TicketsApiError,
  type RetryInfo,
  type TicketsClientOptions,
} from "./index";

// Integração: o cliente roda contra o app real do tickets-api, sem rede.

const TOKEN = "token-de-teste-com-tamanho-ok";
const NOW = new Date("2026-10-29T10:00:00-03:00");
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function startApp(chaos: AppDeps["chaos"] = null) {
  const dir = mkdtempSync(join(tmpdir(), "tickets-client-"));
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
  return createApp({ db, token: TOKEN, chaos, now: () => NOW });
}

function clientFor(
  app: Awaited<ReturnType<typeof startApp>>,
  extra: Partial<TicketsClientOptions> = {},
) {
  const retries: RetryInfo[] = [];
  const client = createTicketsClient({
    baseUrl: "http://tickets.test",
    token: TOKEN,
    fetch: async (input, init) => app.fetch(new Request(input, init)),
    sleep: async () => {},
    onRetry: (info) => retries.push(info),
    ...extra,
  });
  return { client, retries };
}

const vpnTicket = {
  type: "INC",
  title: "VPN não conecta — erro 809",
  description: "Notebook com Windows 11 não conecta na VPN, erro 809.",
  category: "Rede e VPN",
  priority: "Alta",
  affected: "individual",
} as const;

describe("tickets-client", () => {
  it("consulta os chamados em nome do funcionário", async () => {
    const { client } = clientFor(await startApp());
    const tickets = await client.as("ana.souza").listTickets("open");
    expect(tickets.map((t) => t.id)).toContain("INC-20311");
  });

  it("tenta de novo enquanto o sistema está fora do ar e conclui quando ele volta", async () => {
    let clock = 0;
    let draws = 0;
    const app = await startApp({
      failureRate: 0.5,
      outageMs: 3000,
      latencyMs: 0,
      random: () => (draws++ === 0 ? 0 : 1), // só a primeira requisição derruba o serviço
      now: () => clock,
    });
    const { client, retries } = clientFor(app, {
      sleep: async (ms) => {
        clock += ms;
      },
    });

    const tickets = await client.as("ana.souza").listTickets();
    expect(tickets.length).toBeGreaterThan(0);
    expect(retries).toHaveLength(1);
    // Respeita o Retry-After de 3 s em vez de martelar o serviço caído.
    expect(retries[0]).toMatchObject({ reason: "UNAVAILABLE" });
    expect(retries[0]?.delayMs).toBeGreaterThanOrEqual(3000);
  });

  it("desiste depois do limite de tentativas com um erro claro", async () => {
    const app = await startApp({ failureRate: 1, outageMs: 60_000, latencyMs: 0 });
    const { client, retries } = clientFor(app, { attempts: 3 });

    const error = await client
      .as("ana.souza")
      .listTickets()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TicketsApiError);
    expect(error).toMatchObject({ code: "UNAVAILABLE", attempts: 3, retryable: true });
    expect(retries).toHaveLength(2);
  });

  it("não repete erros que não são temporários", async () => {
    const { client, retries } = clientFor(await startApp());
    const error = await client
      .as("ana.souza")
      .getTicket("INC-20402")
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "NOT_FOUND", attempts: 1 });
    expect(retries).toHaveLength(0);
  });

  it("não duplica o chamado quando a resposta se perde e o pedido é repetido", async () => {
    const app = await startApp();
    let dropped = false;
    const { client, retries } = clientFor(app, {
      fetch: async (input, init) => {
        const response = await app.fetch(new Request(input, init));
        if (!dropped && init.method === "POST") {
          dropped = true; // o servidor criou o chamado, mas a resposta não chegou
          throw new TypeError("fetch failed");
        }
        return response;
      },
    });

    const ana = client.as("ana.souza");
    const created = await ana.createTicket(vpnTicket);
    expect(retries).toHaveLength(1);

    const all = await ana.listTickets();
    expect(all.filter((t) => t.title === vpnTicket.title).map((t) => t.id)).toEqual([created.id]);
  });

  it("aplica timeout em quem não responde", async () => {
    const { client } = clientFor(await startApp(), {
      attempts: 1,
      timeoutMs: 20,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    });
    await expect(client.as("ana.souza").listTickets()).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
