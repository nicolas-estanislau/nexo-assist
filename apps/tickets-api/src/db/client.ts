import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { openSqlite, type Migrations } from "@nexo/sqlite";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

// Migrações versionadas e aplicadas na subida. Cada item roda uma única vez.
const MIGRATIONS: Migrations = [
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

export function openDb(url: string) {
  return openSqlite(url, schema, MIGRATIONS);
}
