import "server-only";
import { createMastraInterpreter, type Interpreter, type TicketsConnection } from "@nexo/agent";
import { env } from "./env";

// O agent roda no servidor do app web. A chave do LLM é lida do ambiente pelo Mastra e nunca
// chega ao navegador.

let interpreter: Interpreter | null = null;

export function agentInterpreter(): Interpreter {
  interpreter ??= createMastraInterpreter({ model: env().LLM_MODEL });
  return interpreter;
}

export function ticketsConnection(): TicketsConnection {
  return { baseUrl: env().TICKETS_API_URL, token: env().TICKETS_API_TOKEN };
}
