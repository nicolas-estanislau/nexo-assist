import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, openDb, seedIfEmpty } from "@nexo/tickets-api";
import type { MessagePart } from "@nexo/shared";
import { createMastraInterpreter, partsToText, runTurn, type HistoryMessage } from "../src/index";

// Conversa de verdade com o LLM, contra um tickets-api em arquivo temporário (dados do seed).
// Uso: pnpm --filter @nexo/agent smoke ["mensagem 1" "mensagem 2" ...]

process.loadEnvFile(join(import.meta.dirname, "../../../.env"));

const DEFAULT_SCRIPT = [
  "Como eu conecto na VPN?",
  "Quero saber do meu chamado do notebook",
  "e o chamado da VPN do Bruno, como está?",
  "Meu Outlook não abre desde cedo e tenho reunião com cliente às 15h",
  "Só eu",
  "Quero pedir férias",
];

const messages = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_SCRIPT;
const token = "token-de-teste-com-tamanho-ok";
const { db } = await openDb(`file:${join(mkdtempSync(join(tmpdir(), "smoke-")), "t.db")}`);
await seedIfEmpty(db, new Date());
const app = createApp({ db, token, chaos: null, now: () => new Date() });

const interpreter = createMastraInterpreter({
  model: process.env["LLM_MODEL"] ?? "anthropic/claude-haiku-5-5",
});
const employee = { id: "ana.souza", name: "Ana Souza", department: "Financeiro" };
const history: HistoryMessage[] = [];

const show = (parts: MessagePart[]) => partsToText(parts).replace(/\s+/g, " ");

for (const message of messages) {
  const result = await runTurn({
    employee,
    message,
    history,
    pendingDraft: null,
    tickets: {
      baseUrl: "http://tickets.local",
      token,
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    },
    interpreter,
  });
  const { trace } = result;
  console.log(`\n> ${message}`);
  console.log(`  ${show(result.parts)}`);
  console.log(
    `  [${trace.understood.intent} | confiança ${trace.confidence} | ${trace.latencyMs} ms | ${trace.actions.map((a) => a.tool).join(", ")}]`,
  );
  if (trace.rulesApplied.length > 0) console.log(`  regras: ${trace.rulesApplied.join(" / ")}`);
  for (const part of result.parts) {
    if (part.type === "draft_card") console.log(`  descrição: ${part.draft.description}`);
  }
  if (result.transfer) console.log(`  TRANSFERIDO: ${result.transfer.reason}`);
  history.push({ role: "funcionario", parts: [{ type: "text", text: message }] });
  history.push({ role: "agent", parts: result.parts });
}
