import { matchesFilter, type ConsoleDetail, type Person } from "@/lib/console";
import { requireUser } from "@/server/auth";
import { loadConsoleConversation, loadInbox } from "@/server/console";
import { Console } from "./console";

// Console do analista (telas 4 e 5). A conversa aberta fica na URL (?c=id); sem ela, abre a
// primeira da fila do analista, ou a primeira da lista.

export default async function ConsolePage({ searchParams }: PageProps<"/console">) {
  const user = await requireUser("analista");
  const me: Person = {
    id: user.id,
    name: user.name,
    department: user.department,
    supportLevel: user.supportLevel,
  };

  const items = await loadInbox();
  const { c } = await searchParams;
  const wanted = typeof c === "string" ? c : null;
  const first =
    items.find((i) => i.id === wanted) ??
    items.find((i) => matchesFilter(i, "para_voce", me)) ??
    items[0];

  let detail: ConsoleDetail | null = null;
  if (first) {
    try {
      detail = await loadConsoleConversation(user, first.id);
    } catch {
      detail = null;
    }
  }

  return <Console me={me} initialItems={items} initialDetail={detail} />;
}
