import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Avatar } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { requireUser } from "@/server/auth";
import { SidebarNav } from "./sidebar-nav";

// Estrutura das telas do funcionário (2, 3 e 6): barra lateral fixa e conteúdo à direita.

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("funcionario");

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-white py-5">
        <div className="mb-6 px-6">
          <Logo />
        </div>
        <SidebarNav />
        <div className="mt-auto border-t border-line px-5 pt-4">
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name} size="sm" self />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{user.name}</p>
              <p className="truncate text-[11px] text-muted">{user.email}</p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft hover:text-ink"
            >
              <LogOut className="size-4" /> Sair
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
