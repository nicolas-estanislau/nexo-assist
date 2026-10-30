import { Agent } from "@mastra/core/agent";
import { INSTRUCTIONS } from "./prompt";
import { TurnDecision } from "./decision";

// A única chamada ao LLM do turno. Fica atrás de uma interface para os testes e as avaliações
// trocarem o modelo por respostas fixas.

export interface Interpretation {
  decision: TurnDecision;
  model: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export interface Interpreter {
  interpret(prompt: string): Promise<Interpretation>;
}

export interface GeminiOptions {
  /** Formato do Mastra: "google/gemini-3.5-flash". */
  model: string;
  /** Raciocínio do Gemini. "minimal" mantém a resposta em ~2 s. */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  timeoutMs?: number;
}

export function createMastraInterpreter(options: GeminiOptions): Interpreter {
  const agent = new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: INSTRUCTIONS,
    model: options.model,
  });

  return {
    async interpret(prompt) {
      const result = await agent.generate(prompt, {
        structuredOutput: { schema: TurnDecision },
        modelSettings: { temperature: 0.2 },
        providerOptions: {
          google: { thinkingConfig: { thinkingLevel: options.thinkingLevel ?? "minimal" } },
        },
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
      const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
      return {
        decision: result.object,
        model: options.model,
        usage: usage
          ? { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 }
          : null,
      };
    },
  };
}
