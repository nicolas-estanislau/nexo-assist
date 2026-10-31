import { loadInbox } from "@/server/console";
import { analystOrNull, errorResponse, unauthorized } from "../respond";

/** Lista de conversas do console. O navegador consulta a cada poucos segundos. */
export async function GET() {
  const user = await analystOrNull();
  if (!user) return unauthorized();
  try {
    return Response.json({ items: await loadInbox() });
  } catch (err) {
    return errorResponse(err);
  }
}
