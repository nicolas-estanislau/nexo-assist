import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth";
import { findActiveConversation } from "@/server/conversations";
import { appDb } from "@/server/db";

// O chat (telas 2 e 3) entra na etapa 5. Por ora, a página já resolve a conversa do usuário.

export default async function AtendimentoPage() {
  const user = await requireUser("funcionario");
  const conversation = await findActiveConversation(await appDb(), user.id);

  return (
    <>
      <PageHeader
        title="Atendimento"
        aside={
          <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[12px] font-medium text-ok">
            <span className="size-1.5 rounded-full bg-ok" /> Assistente online
          </span>
        }
      />
      <main className="flex flex-1 items-center justify-center p-6 text-sm text-muted">
        {conversation
          ? "Sua conversa em andamento aparece aqui."
          : `Olá, ${user.name.split(" ")[0]}! O chat com o Nexo Assist chega na próxima etapa.`}
      </main>
    </>
  );
}
