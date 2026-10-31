// Exportado para testes de integração (o cliente roda contra o app real, sem rede).
export { createApp, type AppDeps } from "./app";
export { openDb, type Db } from "./db/client";
export { SEED_EMPLOYEES, SEED_TICKETS, seedIfEmpty } from "./seed";
