import { DraftActionBody } from "@/lib/chat";
import { actOnDraft } from "@/server/chat";
import { employeeOrNull, errorResponse, unauthorized } from "../../respond";

/** Confirmar, editar ou cancelar um rascunho de chamado. */
export async function POST(request: Request, ctx: RouteContext<"/api/chat/drafts/[id]">) {
  const user = await employeeOrNull();
  if (!user) return unauthorized();
  const body = DraftActionBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const { id } = await ctx.params;
    return Response.json(await actOnDraft(user, id, body.data));
  } catch (err) {
    return errorResponse(err);
  }
}
