import { SendMessageBody } from "@/lib/chat";
import { sendAnalystMessage } from "@/server/console";
import { analystOrNull, errorResponse, unauthorized } from "../../../respond";

/** Mensagem do analista para o funcionário. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/console/conversations/[id]/messages">,
) {
  const user = await analystOrNull();
  if (!user) return unauthorized();
  const body = SendMessageBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const { id } = await ctx.params;
    return Response.json(await sendAnalystMessage(user, id, body.data.text));
  } catch (err) {
    return errorResponse(err);
  }
}
