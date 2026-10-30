import type { DecisionTrace } from "@nexo/shared";
import type { RetryInfo } from "@nexo/tickets-client";

export type TraceAction = DecisionTrace["actions"][number];

export type AgentEvent = { type: "action"; action: TraceAction } | { type: "thinking" };

/**
 * Registra o que o agent fez no turno, na ordem, com quantas tentativas cada chamada ao sistema
 * de chamados precisou. Cada passo concluído é emitido na hora, para a interface mostrar os
 * chips enquanto o turno ainda está em andamento.
 */
export class TraceRecorder {
  readonly actions: TraceAction[] = [];
  readonly rules: string[] = [];
  readonly retries: RetryInfo[] = [];

  constructor(private readonly emit: (event: AgentEvent) => void = () => {}) {}

  onRetry = (info: RetryInfo) => {
    this.retries.push(info);
  };

  record(action: Omit<TraceAction, "attempts"> & { attempts?: number }): TraceAction {
    const full: TraceAction = { ...action, attempts: action.attempts ?? 1 };
    this.actions.push(full);
    this.emit({ type: "action", action: full });
    return full;
  }

  /** Executa uma chamada externa e registra o resultado, inclusive as tentativas extras. */
  async call<T>(
    tool: string,
    label: string,
    fn: () => Promise<T>,
    describe?: (result: T) => string | null,
  ): Promise<T> {
    const before = this.retries.length;
    try {
      const result = await fn();
      this.record({
        tool,
        label,
        status: "ok",
        detail: this.withRetries(describe?.(result) ?? null, before),
        attempts: 1 + this.retries.length - before,
      });
      return result;
    } catch (err) {
      this.record({
        tool,
        label,
        status: "erro",
        detail: this.withRetries(err instanceof Error ? err.message : String(err), before),
        attempts: 1 + this.retries.length - before,
      });
      throw err;
    }
  }

  rule(text: string): void {
    if (!this.rules.includes(text)) this.rules.push(text);
  }

  thinking(): void {
    this.emit({ type: "thinking" });
  }

  private withRetries(detail: string | null, before: number): string | null {
    const extra = this.retries.length - before;
    if (extra === 0) return detail;
    const note = `sistema de chamados instável: ${extra + 1} tentativas`;
    return detail ? `${detail} (${note})` : note;
  }
}
