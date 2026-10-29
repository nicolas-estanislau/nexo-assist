import { rmSync } from "node:fs";
import { loadConfig } from "../config";
import { openDb } from "../db/client";
import { seedIfEmpty } from "../seed";

// Apaga o banco local e recria com os dados de exemplo (datas relativas a agora).
const { TICKETS_DATABASE_URL: url } = loadConfig();
if (!url.startsWith("file:")) throw new Error("db:reset só funciona com banco em arquivo.");

const path = url.slice("file:".length);
for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });

const { db, client } = await openDb(url);
await seedIfEmpty(db, new Date());
client.close();
console.log(`Banco recriado em ${path}.`);
