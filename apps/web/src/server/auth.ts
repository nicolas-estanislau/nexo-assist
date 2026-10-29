import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "./env";
import {
  decodeSession,
  encodeSession,
  homeFor,
  REMEMBER_SECONDS,
  SESSION_COOKIE,
  type SessionUser,
} from "./session-token";

// Camada de acesso: toda página, Server Action e Route Handler passa por aqui.
// O proxy só faz uma checagem otimista; a autorização de verdade acontece perto dos dados.

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return decodeSession(token, env().SESSION_SECRET);
});

export async function requireUser(role?: SessionUser["role"]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect(homeFor(user.role));
  return user;
}

export async function startSession(user: SessionUser, remember: boolean): Promise<void> {
  const token = await encodeSession(user, remember, env().SESSION_SECRET);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Sem "manter conectado", o cookie some ao fechar o navegador.
    ...(remember ? { maxAge: REMEMBER_SECONDS } : {}),
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
