import { loadEnvOrExit } from "../config/env.js";
import { openDatabase, resolveDatabasePath } from "../lib/db.js";

// npm run db:migrate：建立或更新資料表
const env = loadEnvOrExit();
const db = openDatabase(env.DATABASE_URL);
const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
console.log(`資料表已是最新版本（版本 ${user_version}）：${resolveDatabasePath(env.DATABASE_URL)}`);
db.close();
