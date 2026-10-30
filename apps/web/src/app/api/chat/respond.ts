import "server-only";
import { getCurrentUser } from "@/server/auth";
import { ChatError } from "@/server/chat";
import { ConversationError } from "@/server/conversations";
import type { SessionUser } from "@/server/session-token";

// Utilitários das rotas do chat: autenticação sem redirect e erros em JSON.

export async function employeeOrNull(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user?.role === "funcionario" ? user : null;
}

export const unauthorized = () => Response.json({ error: "Sessão expirada." }, { status: 401 });

const STATUS: Record<ChatError["code"], number> = {
  LIMIT: 429,
  CLOSED: 409,
  NOT_FOUND: 404,
  INVALID: 409,
};

export function errorMessage(err: unknown): string {
  if (err instanceof ChatError || err instanceof ConversationError) return err.message;
  console.error(err);
  return "Algo deu errado do nosso lado. Tente de novo em instantes.";
}

export function errorResponse(err: unknown): Response {
  const status =
    err instanceof ChatError ? STATUS[err.code] : err instanceof ConversationError ? 409 : 500;
  return Response.json({ error: errorMessage(err) }, { status });
}
