import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { EmployeeRole, SupportLevel } from "@nexo/shared";

// Token da sessão: JWT assinado (HS256) num cookie httpOnly. Sem dependência de next/headers,
// para ser usado tanto no proxy quanto nos Server Components.

export const SESSION_COOKIE = "nexo_session";
export const REMEMBER_SECONDS = 30 * 24 * 60 * 60;
const SHORT_SECONDS = 12 * 60 * 60;

export const SessionUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  department: z.string(),
  role: EmployeeRole,
  supportLevel: SupportLevel.nullable(),
});
export type SessionUser = z.infer<typeof SessionUser>;

const key = (secret: string) => new TextEncoder().encode(secret);

export async function encodeSession(
  user: SessionUser,
  remember: boolean,
  secret: string,
): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${remember ? REMEMBER_SECONDS : SHORT_SECONDS}s`)
    .sign(key(secret));
}

/** Devolve o usuário se o token for válido e não expirado; caso contrário, null. */
export async function decodeSession(
  token: string | undefined,
  secret: string,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    const parsed = SessionUser.safeParse(payload["user"]);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function homeFor(role: SessionUser["role"]): string {
  return role === "analista" ? "/console" : "/atendimento";
}
