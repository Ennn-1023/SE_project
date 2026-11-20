import type { Env } from "./config/env.js";
import type { Clock } from "./lib/clock.js";
import type { Database } from "./lib/db.js";
import type { Logger } from "./lib/logger.js";

/** 所有 service 共用的相依物件；測試時可替換成記憶體資料庫與假時鐘。 */
export interface AppContext {
  db: Database;
  env: Env;
  clock: Clock;
  logger: Logger;
}
