import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

// Tela 1 do protótipo: apresentação do Nexo Assist à esquerda, formulário à direita.

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.25fr_1fr]">
      <section className="hidden flex-col justify-between bg-ink px-14 py-10 text-white lg:flex">
        <Logo tone="light" />

        <div className="max-w-xl">
          <p className="text-[13px] text-white/60">Service desk de TI da Nexo</p>
          <h1 className="mt-3 font-serif text-[44px] leading-[1.1] tracking-tight">
            Seu problema de TI, resolvido em uma conversa.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central
            de ajuda e chama um analista quando precisa.
          </p>

          <div className="mt-10 ml-14 max-w-md space-y-2.5 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
            <div className="flex justify-end">
              <p className="rounded-xl bg-white px-3.5 py-2 text-[13px] text-ink">
                Meu notebook não conecta na VPN. Erro 809.
              </p>
            </div>
            <p className="text-[12px] text-white/50">
              <span className="font-medium text-white/80">Nexo Assist</span> · consultou seus
              chamados · criou um chamado
            </p>
            <p className="max-w-[85%] rounded-xl bg-white/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90">
              Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h
              úteis.
            </p>
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] text-ink">
              <span className="size-1.5 rounded-full bg-warn" />
              <span className="font-semibold">INC-20517</span>
              <span className="text-muted">Rede e VPN · Alta · em até 4 h</span>
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-6">
          {[
            ["8 s", "primeira resposta, em média"],
            ["72%", "resolvidos sem fila"],
            ["6", "analistas online agora"],
          ].map(([value, label], i) => (
            <div key={label} className={i === 0 ? "pr-6" : "px-6"}>
              <dt className="flex items-center gap-2 font-serif text-2xl">
                {value}
                {i === 2 && <span className="size-1.5 rounded-full bg-ok" />}
              </dt>
              <dd className="mt-1 text-[12px] text-white/55">{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <p className="text-[13px] text-muted">
            Problema para entrar?{" "}
            <span className="font-medium text-brand">Ligue no ramal 4000</span>
          </p>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h2 className="font-serif text-[32px] leading-tight">Entrar</h2>
          <p className="mt-1.5 mb-7 text-sm text-muted">
            Use seu e-mail corporativo e a senha da rede Nexo.
          </p>
          <LoginForm />
          <div className="mt-7 border-t border-line pt-5 text-[12px] leading-relaxed text-muted">
            <p className="font-medium text-ink-soft">Ambiente de demonstração</p>
            <p>
              Funcionária: <code className="text-ink">ana.souza@nexo.com.br</code>
              <br />
              Analista: <code className="text-ink">rafael.lima@nexo.com.br</code>
              <br />
              Qualquer senha é aceita.
            </p>
          </div>
        </div>

        <footer className="flex justify-between text-[12px] text-muted">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  );
}
