import { AnalystActionBody } from "@/lib/console";
import { actOnConversation, loadConsoleConversation } from "@/server/console";
import { analystOrNull, errorResponse, unauthorized } from "../../respond";

type Ctx = RouteContext<"/api/console/conversations/[id]">;

/** Conversa aberta no console, com mensagens e chamados do funcionário. */
export async function GET(_request: Request, ctx: Ctx) {
  const user = await analystOrNull();
  if (!user) return unauthorized();
  try {
    const { id } = await ctx.params;
    return Response.json(await loadConsoleConversation(user, id));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Assumir, devolver ao agent ou encerrar. */
export async function POST(request: Request, ctx: Ctx) {
  const user = await analystOrNull();
  if (!user) return unauthorized();
  const body = AnalystActionBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const { id } = await ctx.params;
    return Response.json(await actOnConversation(user, id, body.data));
  } catch (err) {
    return errorResponse(err);
  }
}
