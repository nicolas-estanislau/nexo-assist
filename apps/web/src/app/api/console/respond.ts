import "server-only";
import { getCurrentUser } from "@/server/auth";
import { ConsoleError } from "@/server/console";
import { ConversationError } from "@/server/conversations";
import type { SessionUser } from "@/server/session-token";

// Utilitários das rotas do console: só analistas, erros em JSON.

export async function analystOrNull(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user?.role === "analista" ? user : null;
}

export const unauthorized = () => Response.json({ error: "Sessão expirada." }, { status: 401 });

export function errorResponse(err: unknown): Response {
  if (err instanceof ConsoleError) {
    return Response.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 409 });
  }
  if (err instanceof ConversationError) {
    return Response.json({ error: err.message }, { status: err.code === "NOT_FOUND" ? 404 : 409 });
  }
  console.error(err);
  return Response.json(
    { error: "Algo deu errado do nosso lado. Tente de novo em instantes." },
    { status: 500 },
  );
}
