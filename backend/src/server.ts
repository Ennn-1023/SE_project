import { createApp } from './app.js';
import { Config, ConfigError } from './config/env.js';
import { migrate } from './db/migrations.js';
import { openDatabase } from './lib/db.js';
import { createLogger } from './lib/logger.js';

/** 進入點：載入 Config → 開 DB → migrate → listen。 */
function main() {
  Config.loadDotenv();
  let config: Config;
  try {
    config = Config.load(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const logger = createLogger({ silent: false });
  const db = openDatabase(config.databasePath);
  migrate(db);
  const { app } = createApp({ config, db, logger });
  app.listen(config.port, () => {
    logger.info('server started', { port: config.port, env: config.nodeEnv });
  });
}

main();
