import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

// Abre um banco SQLite (libsql) e aplica migrações versionadas. Cada item de `migrations` é
// uma versão; roda uma única vez, em lote, junto com o registro em schema_migrations.

export type Migrations = readonly (readonly string[])[];

async function migrate(client: Client, migrations: Migrations): Promise<void> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = await client.execute(
    "SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations",
  );
  const current = Number(applied.rows[0]?.["v"] ?? 0);

  for (let version = current + 1; version <= migrations.length; version++) {
    const statements = migrations[version - 1] ?? [];
    await client.batch(
      [
        ...statements,
        {
          sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
          args: [version, new Date().toISOString()],
        },
      ],
      "write",
    );
  }
}

export async function openSqlite<TSchema extends Record<string, unknown>>(
  url: string,
  schema: TSchema,
  migrations: Migrations,
): Promise<{ db: LibSQLDatabase<TSchema>; client: Client }> {
  if (url.startsWith("file:")) {
    mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  }
  const client = createClient({ url });
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(client, migrations);
  return { db: drizzle(client, { schema }), client };
}
