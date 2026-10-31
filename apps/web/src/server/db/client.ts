import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { openSqlite, type Migrations } from "@nexo/sqlite";
import * as schema from "./schema";

export type AppDb = LibSQLDatabase<typeof schema>;

const MIGRATIONS: Migrations = [
  [
    `CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_analyst_id TEXT,
      handoff_reason TEXT,
      handoff_summary TEXT,
      handoff_confidence REAL,
      handoff_ticket_id TEXT,
      employee_message_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    )`,
    `CREATE INDEX conversations_employee_idx ON conversations(employee_id, updated_at)`,
    `CREATE INDEX conversations_status_idx ON conversations(status, updated_at)`,
    `CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL,
      author_id TEXT,
      parts TEXT NOT NULL,
      trace TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at)`,
    `CREATE TABLE conversation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    )`,
  ],
  [
    // Etapa 6: o console mostra para qual nível foi, desde quando espera e quem encerrou.
    `ALTER TABLE conversations ADD COLUMN handoff_level TEXT`,
    `ALTER TABLE conversations ADD COLUMN handoff_at TEXT`,
    `ALTER TABLE conversations ADD COLUMN closed_by TEXT`,
  ],
  [
    // Contador de não lidas no console: até quando cada analista viu cada conversa.
    `CREATE TABLE conversation_reads (
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      analyst_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (conversation_id, analyst_id)
    )`,
  ],
];

export function openAppDb(url: string) {
  return openSqlite(url, schema, MIGRATIONS);
}
