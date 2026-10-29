"use client";

import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";

const INITIAL: LoginState = { error: null, email: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, INITIAL);
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <form action={action} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-[13px] font-medium">
          E-mail corporativo
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={state.email}
            placeholder="nome.sobrenome@nexo.com.br"
            className="h-11 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-sm outline-none placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-[13px] font-medium">
            Senha
          </label>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="text-[13px] font-medium text-brand hover:underline"
          >
            Esqueci minha senha
          </button>
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-11 w-full rounded-lg border border-line bg-white px-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-ink"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {showHelp && (
          <p className="text-[13px] text-muted">
            Troque a senha da rede pelo Portal de Autoatendimento, opção “Senha da rede”, ou ligue
            no ramal 4000.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        <input
          type="checkbox"
          name="remember"
          defaultChecked
          className="size-4 rounded border-line accent-brand"
        />
        Manter conectado neste computador
      </label>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-medium text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-70"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Entrando…
          </>
        ) : (
          <>
            Entrar <ArrowRight className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}
