import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DecisionTrace } from "@nexo/shared";
import { openAppDb, type AppDb } from "./db/client";
import {
  appendMessage,
  countAgentTurns,
  applyTransition,
  ConversationError,
  findActiveConversation,
  findLatestConversation,
  getConversation,
  lastMessage,
  listConsoleConversations,
  listMessages,
  replaceMessageParts,
  startConversation,
} from "./conversations";

const NOW = new Date("2026-10-29T10:00:00-03:00");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

let db: AppDb;
let cleanup: () => void;

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), "web-db-"));
  const opened = await openAppDb(`file:${join(dir, "app.db")}`);
  db = opened.db;
  cleanup = () => {
    opened.client.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Arquivo temporário ainda travado no Windows; ignorar.
    }
  };
});
afterEach(() => cleanup());

describe("conversas", () => {
  it("retoma a conversa em andamento do funcionário", async () => {
    expect(await findActiveConversation(db, "ana.souza")).toBeNull();
    const started = await startConversation(db, "ana.souza", NOW);
    expect((await findActiveConversation(db, "ana.souza"))?.id).toBe(started.id);
    expect(await findActiveConversation(db, "bruno.tavares")).toBeNull();
  });

  it("não retoma uma conversa encerrada", async () => {
    const c = await startConversation(db, "ana.souza", NOW);
    await applyTransition(
      db,
      c.id,
      { event: { type: "encerrar" }, actorId: "ana.souza" },
      later(1),
    );
    expect(await findActiveConversation(db, "ana.souza")).toBeNull();
  });

  it("guarda as mensagens em ordem e conta só as do funcionário", async () => {
    const c = await startConversation(db, "ana.souza", NOW);
    await appendMessage(
      db,
      c.id,
      { role: "funcionario", authorId: "ana.souza", parts: [{ type: "text", text: "Oi" }] },
      NOW,
    );
    await appendMessage(
      db,
      c.id,
      { role: "agent", authorId: null, parts: [{ type: "text", text: "Olá!" }] },
      NOW,
    );

    const history = await listMessages(db, c.id);
    expect(history.map((m) => m.role)).toEqual(["funcionario", "agent"]);
    expect((await getConversation(db, c.id)).employeeMessageCount).toBe(1);
  });

  it("troca as partes de uma mensagem uma vez só (duplo clique em Confirmar)", async () => {
    const c = await startConversation(db, "ana.souza", NOW);
    const original = [{ type: "text" as const, text: "pendente" }];
    const m = await appendMessage(
      db,
      c.id,
      { role: "agent", authorId: null, parts: original },
      NOW,
    );
    const next = [{ type: "text" as const, text: "confirmado" }];
    const results = await Promise.all([
      replaceMessageParts(db, m.id, original, next),
      replaceMessageParts(db, m.id, original, next),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await listMessages(db, c.id))[0]?.parts).toEqual(next);
  });
});

describe("transferência para analista", () => {
  it("percorre agente → fila → analista → agente e registra o histórico", async () => {
    const c = await startConversation(db, "ana.souza", NOW);

    const queued = await applyTransition(
      db,
      c.id,
      {
        event: { type: "transferir" },
        actorId: "agent",
        patch: {
          handoffReason: "Chamado vencido",
          handoffSummary: "INC-20311 parado há 5 dias",
          handoffConfidence: 0.9,
        },
      },
      later(1),
    );
    expect(queued).toMatchObject({
      status: "aguardando_analista",
      handoffReason: "Chamado vencido",
    });

    const taken = await applyTransition(
      db,
      c.id,
      {
        event: { type: "assumir" },
        actorId: "rafael.lima",
        patch: { assignedAnalystId: "rafael.lima" },
      },
      later(2),
    );
    expect(taken).toMatchObject({ status: "com_analista", assignedAnalystId: "rafael.lima" });

    const back = await applyTransition(
      db,
      c.id,
      { event: { type: "devolver" }, actorId: "rafael.lima" },
      later(3),
    );
    expect(back.status).toBe("agente");

    const events = await db.query.conversationEvents.findMany();
    expect(events.map((e) => `${e.fromStatus}>${e.toStatus}`)).toEqual([
      "agente>aguardando_analista",
      "aguardando_analista>com_analista",
      "com_analista>agente",
    ]);
  });

  it("recusa transições inválidas", async () => {
    const c = await startConversation(db, "ana.souza", NOW);
    await expect(
      applyTransition(db, c.id, { event: { type: "devolver" }, actorId: "rafael.lima" }, later(1)),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("só um analista consegue assumir quando dois tentam ao mesmo tempo", async () => {
    const c = await startConversation(db, "ana.souza", NOW);
    await applyTransition(db, c.id, { event: { type: "transferir" }, actorId: "agent" }, later(1));

    const results = await Promise.allSettled([
      applyTransition(
        db,
        c.id,
        {
          event: { type: "assumir" },
          actorId: "rafael.lima",
          patch: { assignedAnalystId: "rafael.lima" },
        },
        later(2),
      ),
      applyTransition(
        db,
        c.id,
        {
          event: { type: "assumir" },
          actorId: "juliana.costa",
          patch: { assignedAnalystId: "juliana.costa" },
        },
        later(2),
      ),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConversationError);
  });
});

describe("console", () => {
  const say = (conversationId: string, at: Date) =>
    appendMessage(
      db,
      conversationId,
      { role: "funcionario", authorId: "x", parts: [{ type: "text", text: "oi" }] },
      at,
    );

  it("lista as conversas em andamento e as encerradas recentes, sem as vazias", async () => {
    const active = await startConversation(db, "ana.souza", NOW);
    await say(active.id, later(1));
    await startConversation(db, "bruno.tavares", NOW); // só a saudação
    const oldClosed = await startConversation(db, "carla.mendes", NOW);
    await say(oldClosed.id, later(1));
    await applyTransition(
      db,
      oldClosed.id,
      { event: { type: "encerrar" }, actorId: "x" },
      later(2),
    );
    const recentClosed = await startConversation(db, "diego.alves", NOW);
    await say(recentClosed.id, later(1));
    await applyTransition(
      db,
      recentClosed.id,
      { event: { type: "encerrar" }, actorId: "x" },
      later(30),
    );

    const ids = (await listConsoleConversations(db, later(10))).map((c) => c.id);
    expect(ids.sort()).toEqual([active.id, recentClosed.id].sort());
  });

  it("registra quem encerrou e qual é a última conversa e mensagem", async () => {
    const c = await startConversation(db, "ana.souza", NOW);
    await say(c.id, later(1));
    const last = await appendMessage(
      db,
      c.id,
      { role: "agent", authorId: null, parts: [{ type: "text", text: "olá" }] },
      later(1),
    );
    expect((await lastMessage(db, c.id))?.id).toBe(last.id);

    const closed = await applyTransition(
      db,
      c.id,
      { event: { type: "encerrar" }, actorId: "rafael.lima" },
      later(5),
    );
    expect(closed.closedBy).toBe("rafael.lima");
    expect((await findLatestConversation(db, "ana.souza"))?.id).toBe(c.id);
    expect(await findActiveConversation(db, "ana.souza")).toBeNull();
  });
});

describe("limite de uso", () => {
  const trace: DecisionTrace = {
    understood: { intent: "duvida", summary: "", entities: {} },
    actions: [],
    rulesApplied: [],
    confidence: 0.9,
    rationale: "",
    model: "teste",
    usage: null,
    latencyMs: 1,
  };
  const reply = (conversationId: string, at: Date) =>
    appendMessage(
      db,
      conversationId,
      { role: "agent", authorId: null, parts: [{ type: "text", text: "ok" }], trace },
      at,
    );

  it("conta só respostas do agent com trace, por funcionário e no total", async () => {
    const ana = await startConversation(db, "ana.souza", NOW); // a saudação não conta
    const bruno = await startConversation(db, "bruno.tavares", NOW);
    await reply(ana.id, later(1));
    await reply(ana.id, later(2));
    await reply(bruno.id, later(3));
    expect(await countAgentTurns(db, NOW)).toBe(3);
    expect(await countAgentTurns(db, NOW, "ana.souza")).toBe(2);
    expect(await countAgentTurns(db, later(2), "ana.souza")).toBe(1);
  });
});
