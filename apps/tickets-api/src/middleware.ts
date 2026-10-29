import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { Employee } from "@nexo/shared";
import type { Db } from "./db/client";
import { employees, idempotencyKeys } from "./db/schema";
import { ApiError } from "./errors";

export type Env = { Variables: { actor: Employee } };

/** Só quem tem o token compartilhado (o app web) chama o serviço. */
export function requireToken(token: string) {
  const expected = Buffer.from(token);
  return createMiddleware(async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const received = Buffer.from(header.replace(/^Bearer /, ""));
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new ApiError("UNAUTHORIZED", "Token inválido.");
    }
    await next();
  });
}

/** Identifica em nome de quem a chamada é feita (X-Actor-Id). As regras de acesso dependem disso. */
export function resolveActor(db: Db) {
  return createMiddleware<Env>(async (c, next) => {
    const actorId = c.req.header("X-Actor-Id");
    if (!actorId) throw new ApiError("UNAUTHORIZED", "Cabeçalho X-Actor-Id ausente.");
    const actor = await db.query.employees.findFirst({ where: eq(employees.id, actorId) });
    if (!actor) throw new ApiError("UNAUTHORIZED", "Usuário desconhecido.");
    c.set("actor", actor);
    await next();
  });
}

export interface ChaosOptions {
  /** Probabilidade (0 a 1) de cada requisição derrubar o serviço. */
  failureRate: number;
  /** Quanto tempo o serviço fica fora do ar depois de cair. */
  outageMs: number;
  /** Latência extra em cada requisição. */
  latencyMs: number;
  random?: () => number;
  now?: () => number;
}

/**
 * Simula o sistema legado: latência e quedas de alguns segundos. Enquanto está fora do ar,
 * todas as requisições recebem 503 com Retry-After, como um proxy na frente de um serviço caído.
 */
export function chaos(options: ChaosOptions) {
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  let downUntil = 0;

  return createMiddleware(async (c, next) => {
    if (options.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    }
    const t = now();
    if (t >= downUntil && random() < options.failureRate) downUntil = t + options.outageMs;
    if (t < downUntil) {
      c.header("Retry-After", String(Math.ceil((downUntil - t) / 1000)));
      throw new ApiError("UNAVAILABLE", "Sistema de chamados temporariamente indisponível.");
    }
    await next();
  });
}

/**
 * Idempotency-Key: se a mesma escrita chegar de novo (retry depois de timeout), devolve a resposta
 * original em vez de executar outra vez. Evita chamado duplicado quando a rede falha.
 */
export function idempotency(db: Db) {
  return createMiddleware<Env>(async (c, next) => {
    const header = c.req.header("Idempotency-Key");
    if (!header || c.req.method === "GET") return next();

    const key = `${c.get("actor").id}:${c.req.method}:${c.req.path}:${header}`;
    const stored = await db.query.idempotencyKeys.findFirst({
      where: eq(idempotencyKeys.key, key),
    });
    if (stored) {
      c.header("Idempotent-Replay", "true");
      return c.body(stored.body, stored.status as 200, { "Content-Type": "application/json" });
    }

    await next();
    if (c.res.status < 500) {
      const body = await c.res.clone().text();
      await db
        .insert(idempotencyKeys)
        .values({ key, status: c.res.status, body, createdAt: new Date().toISOString() })
        .onConflictDoNothing();
    }
  });
}
