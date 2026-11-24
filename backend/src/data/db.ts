import { migrate } from '../db/migrations';
import { openDatabase, transaction, type Database } from '../lib/db';

export type Db = Database;
export { transaction };

/**
 * 開啟 SQLite 並套用所有 migration（含 001 的 users／group_settings 與 002 的搶答資料表）。
 * 測試使用 ':memory:'。
 */
export function openDb(path: string): Db {
  const db = openDatabase(path);
  migrate(db);
  return db;
}
