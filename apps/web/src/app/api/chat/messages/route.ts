import { SendMessageBody, type ChatEvent } from "@/lib/chat";
import { sendMessage } from "@/server/chat";
import { employeeOrNull, errorMessage, unauthorized } from "../respond";

// Envia uma mensagem e devolve o turno em NDJSON: cada passo do agent ("consultou seus
// chamados", "pensando…") chega ao navegador assim que acontece, antes da resposta final.

export async function POST(request: Request) {
  const user = await employeeOrNull();
  if (!user) return unauthorized();
  const body = SendMessageBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Mensagem inválida." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // O navegador fechou a conexão; o turno termina e fica salvo mesmo assim.
        }
      };
      try {
        await sendMessage(user, body.data.text, emit);
      } catch (err) {
        emit({ type: "error", message: errorMessage(err) });
      }
      try {
        controller.close();
      } catch {
        // Já fechado.
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
