import { z } from "zod";
import {
  ApiErrorBody,
  Employee,
  KbArticle,
  KbSearchResult,
  Ticket,
  TicketWithUpdates,
  type AddUpdateInput,
  type AnalystUpdateInput,
  type ApiErrorCode,
  type CreateTicketInput,
  type ReopenInput,
  type TransferTicketInput,
} from "@nexo/shared";

// Cliente tipado do serviço de chamados. O sistema é legado e cai por alguns segundos de vez
// em quando, então toda chamada tem timeout e retry com backoff exponencial. Escritas levam
// uma Idempotency-Key fixa por operação: se a resposta se perder e o retry repetir o pedido,
// o serviço devolve o resultado original em vez de criar um chamado duplicado.

export type TicketsErrorCode = ApiErrorCode | "NETWORK" | "TIMEOUT" | "BAD_RESPONSE";

export class TicketsApiError extends Error {
  constructor(
    readonly code: TicketsErrorCode,
    message: string,
    readonly status: number | null,
    /** Quantas tentativas foram feitas até desistir. */
    readonly attempts: number,
  ) {
    super(message);
    this.name = "TicketsApiError";
  }

  get retryable(): boolean {
    return isRetryable(this.code);
  }
}

function isRetryable(code: TicketsErrorCode): boolean {
  return code === "UNAVAILABLE" || code === "NETWORK" || code === "TIMEOUT";
}

export interface RetryInfo {
  method: string;
  path: string;
  attempt: number;
  delayMs: number;
  reason: TicketsErrorCode;
}

export type FetchLike = (input: URL, init: RequestInit) => Promise<Response>;

export interface TicketsClientOptions {
  baseUrl: string;
  token: string;
  fetch?: FetchLike;
  /** Total de tentativas, incluindo a primeira. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Chamado antes de cada nova tentativa; o agent usa para registrar no trace. */
  onRetry?: (info: RetryInfo) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createTicketsClient(options: TicketsClientOptions) {
  const {
    baseUrl,
    token,
    fetch: fetchImpl = fetch,
    attempts = 4,
    baseDelayMs = 300,
    maxDelayMs = 3000,
    timeoutMs = 4000,
    sleep = defaultSleep,
    onRetry,
  } = options;

  async function attempt(
    method: string,
    path: string,
    headers: Headers,
    body: string | undefined,
  ): Promise<
    | { response: Response }
    | {
        error: TicketsErrorCode;
        message: string;
        status: number | null;
        retryAfterMs: number | null;
      }
  > {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        method,
        headers,
        body: body ?? null,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timeout =
        err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      return timeout
        ? {
            error: "TIMEOUT",
            message: `Sem resposta em ${timeoutMs} ms.`,
            status: null,
            retryAfterMs: null,
          }
        : {
            error: "NETWORK",
            message: "Falha de conexão com o sistema de chamados.",
            status: null,
            retryAfterMs: null,
          };
    }
    if (response.ok) return { response };

    const parsed = ApiErrorBody.safeParse(await response.json().catch(() => null));
    const code: TicketsErrorCode = parsed.success
      ? parsed.data.error.code
      : response.status >= 500
        ? "UNAVAILABLE"
        : "BAD_RESPONSE";
    const retryAfter = Number(response.headers.get("Retry-After"));
    return {
      error: code,
      message: parsed.success ? parsed.data.error.message : `HTTP ${response.status}`,
      status: response.status,
      retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
    };
  }

  async function request<T>(
    schema: z.ZodType<T>,
    method: "GET" | "POST" | "PATCH",
    path: string,
    actorId: string | null,
    body?: unknown,
  ): Promise<T> {
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    if (actorId) headers.set("X-Actor-Id", actorId);
    if (method !== "GET") headers.set("Idempotency-Key", crypto.randomUUID());
    const payload = body === undefined ? undefined : JSON.stringify(body);
    if (payload) headers.set("Content-Type", "application/json");

    for (let n = 1; ; n++) {
      const result = await attempt(method, path, headers, payload);
      if ("response" in result) {
        const data = schema.safeParse(await result.response.json().catch(() => null));
        if (!data.success) {
          throw new TicketsApiError(
            "BAD_RESPONSE",
            "Resposta inesperada do sistema de chamados.",
            result.response.status,
            n,
          );
        }
        return data.data;
      }
      if (!isRetryable(result.error) || n >= attempts) {
        throw new TicketsApiError(result.error, result.message, result.status, n);
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (n - 1));
      const jitter = Math.random() * baseDelayMs * 0.5;
      const delayMs = Math.round(
        Math.min(maxDelayMs, Math.max(backoff, result.retryAfterMs ?? 0)) + jitter,
      );
      onRetry?.({ method, path, attempt: n, delayMs, reason: result.error });
      await sleep(delayMs);
    }
  }

  const enc = encodeURIComponent;

  return {
    health: () => request(z.object({ ok: z.boolean() }), "GET", "/health", null),

    findEmployeeByEmail: (email: string) =>
      request(Employee, "GET", `/employees/by-email/${enc(email)}`, null),
    getEmployee: (id: string) => request(Employee, "GET", `/employees/${enc(id)}`, null),

    searchKb: (query: string, limit = 3) =>
      request(
        z.object({ results: z.array(KbSearchResult) }),
        "GET",
        `/kb/search?q=${enc(query)}&limit=${limit}`,
        null,
      ).then((r) => r.results),
    getArticle: (id: string) => request(KbArticle, "GET", `/kb/articles/${enc(id)}`, null),

    /**
     * Operações sobre chamados sempre em nome de alguém. O agent recebe um cliente já
     * amarrado ao funcionário da sessão e não tem como pedir em nome de outra pessoa.
     */
    as(actorId: string) {
      return {
        listTickets: (scope: "open" | "all" = "all", requesterId: string = actorId) =>
          request(
            z.object({ tickets: z.array(Ticket) }),
            "GET",
            `/tickets?scope=${scope}&requesterId=${enc(requesterId)}`,
            actorId,
          ).then((r) => r.tickets),
        getTicket: (id: string) =>
          request(TicketWithUpdates, "GET", `/tickets/${enc(id)}`, actorId),
        createTicket: (input: CreateTicketInput) =>
          request(Ticket, "POST", "/tickets", actorId, input),
        addUpdate: (id: string, input: AddUpdateInput) =>
          request(TicketWithUpdates, "POST", `/tickets/${enc(id)}/updates`, actorId, input),
        reopenTicket: (id: string, input: ReopenInput) =>
          request(TicketWithUpdates, "POST", `/tickets/${enc(id)}/reopen`, actorId, input),
        transferTicket: (id: string, input: TransferTicketInput) =>
          request(TicketWithUpdates, "POST", `/tickets/${enc(id)}/transfer`, actorId, input),
        updateAsAnalyst: (id: string, input: AnalystUpdateInput) =>
          request(TicketWithUpdates, "PATCH", `/tickets/${enc(id)}`, actorId, input),
      };
    },
  };
}

export type TicketsClient = ReturnType<typeof createTicketsClient>;
export type ActorTicketsClient = ReturnType<TicketsClient["as"]>;
