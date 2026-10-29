import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

// Migrações versionadas e aplicadas na subida. Cada item roda uma única vez.
const MIGRATIONS: readonly string[][] = [
  [
    `CREATE TABLE employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL,
      role TEXT NOT NULL,
      support_level TEXT
    )`,
    `CREATE TABLE tickets (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      affected TEXT NOT NULL,
      requester_id TEXT NOT NULL REFERENCES employees(id),
      support_level TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    )`,
    `CREATE INDEX tickets_requester_idx ON tickets(requester_id)`,
    `CREATE TABLE ticket_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL REFERENCES tickets(id),
      kind TEXT NOT NULL,
      author_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX ticket_updates_ticket_idx ON ticket_updates(ticket_id)`,
    `CREATE TABLE kb_articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tags TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
    `CREATE TABLE idempotency_keys (
      key TEXT PRIMARY KEY,
      status INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  ],
];

async function migrate(client: Client): Promise<void> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = await client.execute(
    "SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations",
  );
  const current = Number(applied.rows[0]?.["v"] ?? 0);

  for (let version = current + 1; version <= MIGRATIONS.length; version++) {
    const statements = MIGRATIONS[version - 1] ?? [];
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

export async function openDb(url: string): Promise<{ db: Db; client: Client }> {
  if (url.startsWith("file:")) {
    mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  }
  const client = createClient({ url });
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(client);
  return { db: drizzle(client, { schema }), client };
}
