import { loadEnvOrExit } from "../config/env.js";
import { systemClock } from "../lib/clock.js";
import { openDatabase } from "../lib/db.js";
import { createLogger } from "../lib/logger.js";
import { ensureTeacher } from "../seed.js";

// npm run seed：初始化老師帳號（冪等；不印出任何密碼）
const env = loadEnvOrExit();
const db = openDatabase(env.DATABASE_URL);
const logger = createLogger();
const result = await ensureTeacher({ db, env, clock: systemClock, logger });
console.log(
  result === "created"
    ? `已建立老師帳號：${env.TEACHER_USERNAME}（密碼為 TEACHER_INITIAL_PASSWORD 的值）`
    : "老師帳號已存在，未變更",
);
db.close();
