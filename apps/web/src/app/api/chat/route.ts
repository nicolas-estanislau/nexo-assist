import { loadChat, startNewChat } from "@/server/chat";
import { employeeOrNull, errorResponse, unauthorized } from "./respond";

/** Estado atual do chat. O navegador consulta enquanto a conversa está com um analista. */
export async function GET() {
  const user = await employeeOrNull();
  if (!user) return unauthorized();
  try {
    return Response.json(await loadChat(user));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Nova conversa: encerra a atual. */
export async function DELETE() {
  const user = await employeeOrNull();
  if (!user) return unauthorized();
  try {
    return Response.json(await startNewChat(user));
  } catch (err) {
    return errorResponse(err);
  }
}
