import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  AddUpdateInput,
  AnalystUpdateInput,
  CreateTicketInput,
  ReopenInput,
  TransferTicketInput,
  type ApiErrorBody,
} from "@nexo/shared";
import type { Db } from "./db/client";
import { employees } from "./db/schema";
import { ApiError } from "./errors";
import {
  chaos,
  idempotency,
  requireToken,
  resolveActor,
  type ChaosOptions,
  type Env,
} from "./middleware";
import { getArticle, searchArticles } from "./services/kb";
import * as ticketsService from "./services/tickets";

export interface AppDeps {
  db: Db;
  token: string;
  chaos: ChaosOptions | null;
  now: () => Date;
}

async function parseBody<T>(schema: z.ZodType<T>, req: Request): Promise<T> {
  const json: unknown = await req.json().catch(() => null);
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError("VALIDATION", z.prettifyError(result.error));
  }
  return result.data;
}

export function createApp({ db, token, chaos: chaosOptions, now }: AppDeps) {
  const app = new Hono<Env>();

  app.onError((err, c) => {
    const apiError =
      err instanceof ApiError
        ? err
        : new ApiError("INTERNAL", "Erro interno no sistema de chamados.");
    if (!(err instanceof ApiError)) console.error(err);
    const body: ApiErrorBody = { error: { code: apiError.code, message: apiError.message } };
    return c.json(body, apiError.status);
  });
  app.notFound((c) =>
    c.json({ error: { code: "NOT_FOUND", message: "Rota não encontrada." } }, 404),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.use("*", requireToken(token));

  // --- Diretório de funcionários (usado no login) ---

  app.get("/employees/by-email/:email", async (c) => {
    const email = c.req.param("email").toLowerCase();
    const employee = await db.query.employees.findFirst({ where: eq(employees.email, email) });
    if (!employee) throw new ApiError("NOT_FOUND", "Funcionário não encontrado.");
    return c.json(employee);
  });

  app.get("/employees/:id", async (c) => {
    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, c.req.param("id")),
    });
    if (!employee) throw new ApiError("NOT_FOUND", "Funcionário não encontrado.");
    return c.json(employee);
  });

  // --- Central de ajuda ---

  app.get("/kb/search", async (c) => {
    const query = c.req.query("q") ?? "";
    const limit = Math.min(Number(c.req.query("limit") ?? 3) || 3, 10);
    return c.json({ results: await searchArticles(db, query, limit) });
  });

  app.get("/kb/articles/:id", async (c) => {
    const article = await getArticle(db, c.req.param("id"));
    if (!article) throw new ApiError("NOT_FOUND", "Artigo não encontrado.");
    return c.json(article);
  });

  // --- Chamados (o sistema legado instável) ---

  const ticketsApi = new Hono<Env>();
  if (chaosOptions) ticketsApi.use("*", chaos(chaosOptions));
  ticketsApi.use("*", resolveActor(db), idempotency(db));

  ticketsApi.get("/", async (c) => {
    const actor = c.get("actor");
    const requesterId = c.req.query("requesterId") ?? actor.id;
    const scope = c.req.query("scope") === "open" ? "open" : "all";
    return c.json({ tickets: await ticketsService.listTickets(db, actor, requesterId, scope) });
  });

  ticketsApi.post("/", async (c) => {
    const input = await parseBody(CreateTicketInput, c.req.raw);
    return c.json(await ticketsService.createTicket(db, c.get("actor"), input, now()), 201);
  });

  ticketsApi.get("/:id", async (c) =>
    c.json(await ticketsService.getTicket(db, c.get("actor"), c.req.param("id"))),
  );

  ticketsApi.patch("/:id", async (c) => {
    const input = await parseBody(AnalystUpdateInput, c.req.raw);
    return c.json(
      await ticketsService.analystUpdate(db, c.get("actor"), c.req.param("id"), input, now()),
    );
  });

  ticketsApi.post("/:id/updates", async (c) => {
    const input = await parseBody(AddUpdateInput, c.req.raw);
    return c.json(
      await ticketsService.addUpdate(db, c.get("actor"), c.req.param("id"), input, now()),
    );
  });

  ticketsApi.post("/:id/reopen", async (c) => {
    const input = await parseBody(ReopenInput, c.req.raw);
    return c.json(
      await ticketsService.reopenTicket(db, c.get("actor"), c.req.param("id"), input, now()),
    );
  });

  ticketsApi.post("/:id/transfer", async (c) => {
    const input = await parseBody(TransferTicketInput, c.req.raw);
    return c.json(
      await ticketsService.transferTicket(db, c.get("actor"), c.req.param("id"), input, now()),
    );
  });

  app.route("/tickets", ticketsApi);
  return app;
}
