import { requireUser } from "@/server/auth";
import { loadChat } from "@/server/chat";
import { Chat } from "./chat";

// Telas 2 e 3: a conversa em andamento é retomada de onde parou, inclusive após reiniciar o app.

export default async function AtendimentoPage() {
  const user = await requireUser("funcionario");
  const initial = await loadChat(user);
  return <Chat initial={initial} firstName={user.name.split(" ")[0] ?? user.name} />;
}
