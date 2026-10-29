import { z } from "zod";

const EnvSchema = z.object({
  TICKETS_API_PORT: z.coerce.number().int().positive().default(4000),
  TICKETS_API_TOKEN: z.string().min(16, "TICKETS_API_TOKEN precisa de ao menos 16 caracteres"),
  TICKETS_DATABASE_URL: z.string().default("file:./data/tickets.db"),
  TICKETS_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.05),
  TICKETS_OUTAGE_SECONDS: z.coerce.number().min(0).default(3),
  TICKETS_LATENCY_MS: z.coerce.number().min(0).default(150),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuração inválida do tickets-api:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
