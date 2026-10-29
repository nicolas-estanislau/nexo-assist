import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { PasswordCard } from "./password-card";

// Tela 6 do protótipo.

export default async function PerfilPage() {
  const user = await requireUser("funcionario");

  return (
    <>
      <PageHeader title="Meu perfil" />
      <main className="flex-1 overflow-y-auto px-6 py-10">
        <div className="mx-auto max-w-xl space-y-5">
          <div>
            <h1 className="text-[22px] font-semibold">Meu perfil</h1>
            <p className="mt-1 text-[13px] text-muted">
              Seus dados de acesso ao service desk de TI.
            </p>
          </div>

          <dl className="divide-y divide-line rounded-xl border border-line bg-white text-[13px] shadow-sm">
            <div className="grid grid-cols-[150px_1fr] items-center px-4 py-3.5">
              <dt className="text-muted">Nome</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div className="grid grid-cols-[150px_1fr] items-center px-4 py-3.5">
              <dt className="text-muted">Departamento</dt>
              <dd className="font-medium">{user.department}</dd>
            </div>
            <div className="grid grid-cols-[150px_1fr_auto] items-center px-4 py-3.5">
              <dt className="text-muted">E-mail corporativo</dt>
              <dd className="font-medium">{user.email}</dd>
              <dd className="flex items-center gap-1 text-[12px] text-muted">
                <Lock className="size-3.5" /> Gerenciado pela TI
              </dd>
            </div>
          </dl>

          <PasswordCard />
        </div>
      </main>
    </>
  );
}
