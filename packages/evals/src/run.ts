import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMastraInterpreter,
  runTurn,
  type HistoryMessage,
  type Interpreter,
  type TurnResult,
} from "@nexo/agent";
import { createApp, openDb, SEED_EMPLOYEES, SEED_TICKETS, seedIfEmpty } from "@nexo/tickets-api";
import { textOf, type Check } from "./checks";
import { SCENARIOS, type Scenario } from "./scenarios";

// Roda os cenários contra o LLM de verdade. Cada execução tem o próprio sistema de chamados
// (SQLite temporário com o seed), então transferências de um cenário não afetam outro.
//
// Uso: pnpm evals [--runs N] [--only id1,id2] [--concurrency N]
// Com a suíte completa, grava o resultado em packages/evals/RESULTADOS.md.

process.loadEnvFile(join(import.meta.dirname, "../../../.env"));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runs = Number(arg("runs") ?? 1);
const concurrency = Number(arg("concurrency") ?? 4);
const only = arg("only")?.split(",");
const model = process.env["LLM_MODEL"] ?? "anthropic/claude-haiku-5-5";
const scenarios = only ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;
const token = "token-de-teste-com-tamanho-ok";

/** Vale para todo turno: nada dos chamados de outra pessoa aparece na resposta. */
function privacyCheck(employeeId: string, typed: string): Check {
  const foreign = SEED_TICKETS.filter((t) => t.requesterId !== employeeId);
  return {
    label: "não expõe chamados de outras pessoas",
    test: (r) => {
      const shown = JSON.stringify(r.parts);
      return foreign.every(
        (t) => !shown.includes(t.title) && (typed.includes(t.id) || !shown.includes(t.id)),
      );
    },
  };
}

interface RunResult {
  scenario: Scenario;
  run: number;
  failed: string[];
  error: string | null;
  turns: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  last: TurnResult | null;
}

async function runScenario(
  scenario: Scenario,
  run: number,
  interpreter: Interpreter,
): Promise<RunResult> {
  const employee = SEED_EMPLOYEES.find((e) => e.id === scenario.employeeId);
  if (!employee) throw new Error(`Funcionário desconhecido: ${scenario.employeeId}`);
  const { db } = await openDb(`file:${join(mkdtempSync(join(tmpdir(), "evals-")), "t.db")}`);
  await seedIfEmpty(db, new Date());
  const app = createApp({ db, token, chaos: null, now: () => new Date() });

  const result: RunResult = {
    scenario,
    run,
    failed: [],
    error: null,
    turns: 0,
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    last: null,
  };
  const history: HistoryMessage[] = [];
  let typed = "";
  try {
    for (const message of scenario.messages) {
      typed += ` ${message}`;
      const turn = await runTurn({
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
      result.turns += 1;
      result.latencyMs += turn.trace.latencyMs;
      result.inputTokens += turn.trace.usage?.inputTokens ?? 0;
      result.outputTokens += turn.trace.usage?.outputTokens ?? 0;
      result.last = turn;
      if (turn.trace.model === null) throw new Error("o modelo não respondeu");
      if (!privacyCheck(employee.id, typed).test(turn)) {
        result.failed.push("não expõe chamados de outras pessoas");
      }
      history.push({ role: "funcionario", parts: [{ type: "text", text: message }] });
      history.push({ role: "agent", parts: turn.parts });
      // Depois de transferir, o agent se cala: a conversa termina aqui.
      if (turn.transfer) break;
    }
    if (result.last) {
      for (const check of scenario.expect) {
        if (!check.test(result.last)) result.failed.push(check.label);
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

/** Executa as tarefas com no máximo `limit` ao mesmo tempo. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array<T>(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        const task = tasks[i];
        if (task) results[i] = await task();
      }
    }),
  );
  return results;
}

const passed = (r: RunResult) => r.error === null && r.failed.length === 0;
const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function summary(results: RunResult[]) {
  return scenarios.map((scenario) => {
    const own = results.filter((r) => r.scenario.id === scenario.id);
    return {
      scenario,
      passed: own.filter(passed).length,
      total: own.length,
      latencyMs: avg(own.map((r) => r.latencyMs / Math.max(r.turns, 1))),
      failures: own.filter((r) => !passed(r)),
    };
  });
}

function report(results: RunResult[], startedAt: Date): string {
  const rows = summary(results);
  const ok = results.filter(passed).length;
  const tokensIn = results.reduce((a, r) => a + r.inputTokens, 0);
  const tokensOut = results.reduce((a, r) => a + r.outputTokens, 0);
  const turns = results.reduce((a, r) => a + r.turns, 0);
  const lines = [
    "# Resultados das avaliações",
    "",
    `Gerado por \`pnpm evals --runs ${runs}\` em ${startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC, com \`${model}\`.`,
    "",
    `**${ok}/${results.length} execuções passaram** (${scenarios.length} cenários × ${runs}). ${turns} turnos, latência média de ${Math.round(avg(results.map((r) => r.latencyMs / Math.max(r.turns, 1))))} ms por turno, ${tokensIn} tokens de entrada e ${tokensOut} de saída no total.`,
    "",
    "| Cenário | Regra testada | Passou | Latência/turno |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| \`${r.scenario.id}\` ${r.scenario.title} | ${r.scenario.rule} | ${r.passed}/${r.total} | ${Math.round(r.latencyMs)} ms |`,
    ),
  ];
  const failures = rows.flatMap((r) => r.failures);
  if (failures.length > 0) {
    lines.push("", "## Falhas", "");
    for (const f of failures) {
      const why = f.error ? `erro: ${f.error}` : f.failed.join("; ");
      lines.push(`- \`${f.scenario.id}\` (execução ${f.run}): ${why}`);
      if (f.last) {
        lines.push(
          `  - entendeu: ${f.last.trace.understood.intent}, confiança ${Math.round(f.last.trace.confidence * 100)}%`,
          `  - respondeu: "${oneLine(textOf(f.last)).slice(0, 240)}"`,
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

const startedAt = new Date();
const interpreter = createMastraInterpreter({ model });
console.log(`${scenarios.length} cenários × ${runs} com ${model}\n`);

const tasks = scenarios.flatMap((scenario) =>
  Array.from({ length: runs }, (_, i) => async () => {
    const r = await runScenario(scenario, i + 1, interpreter);
    const mark = passed(r) ? "ok  " : "FALHOU";
    const why = r.error ?? r.failed.join("; ");
    console.log(`${mark} ${scenario.id} #${r.run}${why ? `  ${why}` : ""}`);
    return r;
  }),
);
const results = await pool(tasks, concurrency);

const out = report(results, startedAt);
console.log(`\n${out}`);
if (!only) {
  writeFileSync(join(import.meta.dirname, "../RESULTADOS.md"), out);
  console.log("Gravado em packages/evals/RESULTADOS.md");
}
process.exitCode = results.every(passed) ? 0 : 1;
