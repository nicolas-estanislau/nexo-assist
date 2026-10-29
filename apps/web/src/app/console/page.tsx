import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { requireUser } from "@/server/auth";

// O console do analista (telas 4 e 5) entra na etapa 6.

export default async function ConsolePage() {
  const user = await requireUser("analista");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-6">
      <Logo />
      <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-5 py-4 shadow-sm">
        <Avatar name={user.name} />
        <div>
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="text-[12px] text-muted">
            Suporte {user.supportLevel} · console em construção
          </p>
        </div>
        <form action={logout} className="ml-4">
          <button
            type="submit"
            className="flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink"
          >
            <LogOut className="size-4" /> Sair
          </button>
        </form>
      </div>
    </main>
  );
}
