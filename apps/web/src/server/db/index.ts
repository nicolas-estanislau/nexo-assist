import "server-only";
import { env } from "../env";
import { openAppDb, type AppDb } from "./client";

// Uma conexão por processo. Em dev o módulo é recarregado a cada mudança, então a promessa
// fica no globalThis para não abrir conexões novas a cada hot reload.
const globalForDb = globalThis as unknown as { appDb?: Promise<AppDb> };

export function appDb(): Promise<AppDb> {
  globalForDb.appDb ??= openAppDb(env().APP_DATABASE_URL).then(({ db }) => db);
  return globalForDb.appDb;
}
