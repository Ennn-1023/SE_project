import { Config, ConfigError } from '../config/env.js';
import { migrate } from '../db/migrations.js';
import { openDatabase } from '../lib/db.js';

/** npm run db:migrate */
Config.loadDotenv();
try {
  const config = Config.load(process.env);
  const db = openDatabase(config.databasePath);
  const ran = migrate(db);
  console.log(ran.length ? `已套用 migration：${ran.join(', ')}` : '資料庫已是最新版本');
  db.close();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
