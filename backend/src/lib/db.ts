import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../db/migrations.js";

export type Database = DatabaseSync;

const BACKEND_DIR = fileURLToPath(new URL("../..", import.meta.url));

/**
 * 解析 DATABASE_URL：`:memory:`、`file::memory:`、`file:./dev.db`（相對於 backend/）或絕對路徑。
 */
export function resolveDatabasePath(databaseUrl: string): string {
  const raw = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
  if (raw === ":memory:") return raw;
  return isAbsolute(raw) ? raw : resolve(BACKEND_DIR, raw);
}

export function openDatabase(databaseUrl: string): Database {
  const path = resolveDatabasePath(databaseUrl);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}
