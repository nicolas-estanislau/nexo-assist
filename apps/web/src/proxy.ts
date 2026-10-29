import { NextResponse, type NextRequest } from "next/server";
import { decodeSession, homeFor, SESSION_COOKIE } from "./server/session-token";

// Checagem otimista: manda para o login quem não tem sessão e para a própria área quem entra
// na área do outro papel. A autorização definitiva é refeita em cada página e ação (server/auth).

const AREAS = [
  { prefix: "/atendimento", role: "funcionario" },
  { prefix: "/perfil", role: "funcionario" },
  { prefix: "/console", role: "analista" },
] as const;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = await decodeSession(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env["SESSION_SECRET"] ?? "",
  );

  if (pathname === "/login") {
    return user
      ? NextResponse.redirect(new URL(homeFor(user.role), request.url))
      : NextResponse.next();
  }

  const area = AREAS.find((a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`));
  if (!area) return NextResponse.next();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (user.role !== area.role) {
    return NextResponse.redirect(new URL(homeFor(user.role), request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/atendimento/:path*", "/perfil/:path*", "/console/:path*"],
};
