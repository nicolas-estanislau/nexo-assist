import { z } from "zod";

const EnvSchema = z.object({
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET precisa de ao menos 32 caracteres"),
  TICKETS_API_URL: z.url().default("http://localhost:4000"),
  TICKETS_API_TOKEN: z.string().min(16),
  APP_DATABASE_URL: z.string().default("file:./data/app.db"),
  MAX_MESSAGES_PER_SESSION: z.coerce.number().int().positive().default(30),
  LLM_MODEL: z.string().min(1).default("google/gemini-3.5-flash"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Lido sob demanda, para o build não exigir segredos. */
export function env(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Configuração inválida do app web:\n${z.prettifyError(result.error)}`);
  }
  cached = result.data;
  return cached;
}
