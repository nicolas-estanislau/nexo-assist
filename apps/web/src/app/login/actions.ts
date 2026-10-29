"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { TicketsApiError } from "@nexo/tickets-client";
import { endSession, startSession } from "@/server/auth";
import { homeFor } from "@/server/session-token";
import { ticketsClient } from "@/server/tickets";

export type LoginState = {
  error: string | null;
  email: string;
};

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")),
  password: z.string().min(1, "Informe a senha."),
  remember: z.boolean(),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const parsed = LoginInput.safeParse({
    email,
    password: String(formData.get("password") ?? ""),
    remember: formData.get("remember") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", email };
  }

  // Protótipo: qualquer senha é aceita para os funcionários dos dados de exemplo.
  // Em produção, a senha seria validada no provedor de identidade da Nexo (SSO).
  let employee;
  try {
    employee = await ticketsClient().findEmployeeByEmail(parsed.data.email);
  } catch (err) {
    if (err instanceof TicketsApiError && err.code === "NOT_FOUND") {
      return { error: "Não encontramos esse e-mail corporativo.", email };
    }
    return {
      error: "Não foi possível validar seu acesso agora. Tente de novo em instantes.",
      email,
    };
  }

  await startSession(employee, parsed.data.remember);
  redirect(homeFor(employee.role));
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
