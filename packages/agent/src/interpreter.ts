import { Agent } from "@mastra/core/agent";
import { INSTRUCTIONS } from "./prompt";
import { TurnDecision } from "./decision";

// A única chamada ao LLM do turno. Fica atrás de uma interface para os testes e as avaliações
// trocarem o modelo por respostas fixas.

export interface Interpretation {
  decision: TurnDecision;
  model: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  /** Chamadas feitas ao modelo até ter uma resposta. */
  attempts: number;
}

export interface Interpreter {
  interpret(prompt: string): Promise<Interpretation>;
}

export interface ModelOptions {
  /** Formato do Mastra (provedor/modelo): "anthropic/claude-haiku-5-5", "google/gemini-3.5-flash". */
  model: string;
  /**
   * Limite de cada tentativa. A resposta normal leva ~2 s, mas de vez em quando o modelo
   * passa de 30 s; cortar cedo e tentar de novo sai bem mais rápido do que esperar.
   */
  attemptTimeoutMs?: number;
  attempts?: number;
}

type Usage = { inputTokens?: number; outputTokens?: number } | undefined;

function usageOf(result: { usage?: Usage; totalUsage?: Usage }): Interpretation["usage"] {
  const usage = result.totalUsage ?? result.usage;
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  return inputTokens + outputTokens > 0 ? { inputTokens, outputTokens } : null;
}

/**
 * Ajustes por provedor. A tarefa é curta (classificar e preencher um JSON), então o raciocínio
 * estendido fica desligado: sai mais rápido e mais barato sem perder qualidade.
 */
function settingsFor(model: string) {
  if (model.startsWith("anthropic/")) {
    // Modelos Claude atuais rejeitam temperature fora do padrão.
    return { providerOptions: { anthropic: { thinking: { type: "disabled" as const } } } };
  }
  if (model.startsWith("google/")) {
    return {
      modelSettings: { temperature: 0.2 },
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" as const } } },
    };
  }
  return {};
}

export function createMastraInterpreter(options: ModelOptions): Interpreter {
  const agent = new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: INSTRUCTIONS,
    model: options.model,
  });
  const maxAttempts = options.attempts ?? 2;
  const settings = settingsFor(options.model);

  return {
    async interpret(prompt) {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await agent.generate(prompt, {
            structuredOutput: { schema: TurnDecision },
            ...settings,
            abortSignal: AbortSignal.timeout(options.attemptTimeoutMs ?? 9_000),
          });
          // Quando a saída estruturada falha, o Mastra pode devolver `object` vazio em vez de lançar.
          const parsed = TurnDecision.safeParse(result.object);
          if (!parsed.success) {
            lastError = new Error("O modelo respondeu fora do formato esperado.");
            continue;
          }
          return {
            decision: parsed.data,
            model: options.model,
            usage: usageOf(result as { usage?: Usage; totalUsage?: Usage }),
            attempts: attempt,
          };
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    },
  };
}
