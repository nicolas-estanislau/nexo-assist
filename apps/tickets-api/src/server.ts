import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDb } from "./db/client";
import { seedIfEmpty } from "./seed";

const config = loadConfig();
const { db } = await openDb(config.TICKETS_DATABASE_URL);
if (await seedIfEmpty(db, new Date()))
  console.log("Banco de chamados criado com dados de exemplo.");

const app = createApp({
  db,
  token: config.TICKETS_API_TOKEN,
  chaos: {
    failureRate: config.TICKETS_FAILURE_RATE,
    outageMs: config.TICKETS_OUTAGE_SECONDS * 1000,
    latencyMs: config.TICKETS_LATENCY_MS,
  },
  now: () => new Date(),
});

serve({ fetch: app.fetch, port: config.TICKETS_API_PORT }, ({ port }) => {
  console.log(
    `tickets-api em http://localhost:${port} (falhas: ${config.TICKETS_FAILURE_RATE * 100}%, ` +
      `latência: ${config.TICKETS_LATENCY_MS} ms)`,
  );
});
