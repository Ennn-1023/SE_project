import { createApp } from "./app.js";
import { loadEnvOrExit } from "./config/env.js";
import type { AppContext } from "./context.js";
import { systemClock } from "./lib/clock.js";
import { openDatabase } from "./lib/db.js";
import { createLogger } from "./lib/logger.js";
import { ensureTeacher } from "./seed.js";

const env = loadEnvOrExit();
const logger = createLogger({ level: env.NODE_ENV === "production" ? "info" : "debug" });
const db = openDatabase(env.DATABASE_URL);
const ctx: AppContext = { db, env, clock: systemClock, logger };

await ensureTeacher(ctx);
const app = createApp(ctx);
app.listen(env.PORT, () => {
  logger.info(`後端已啟動：http://localhost:${env.PORT}`);
});
