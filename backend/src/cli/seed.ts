import { createContainer } from '../app.js';
import { Config, ConfigError } from '../config/env.js';
import { migrate } from '../db/migrations.js';
import { openDatabase } from '../lib/db.js';

/** npm run db:seed：建立老師帳號（已存在則略過，不覆蓋密碼）。group_settings 由 migration 建立。 */
Config.loadDotenv();
try {
  const config = Config.load(process.env);
  const db = openDatabase(config.databasePath);
  migrate(db);
  const container = createContainer({ config, db });
  const before = container.repos.users.findByAccount(config.teacherAccount.toUpperCase());
  const teacher = await container.services.accounts.seedTeacher();
  console.log(
    before ? `老師帳號 ${teacher.account} 已存在，略過` : `已建立老師帳號 ${teacher.account}`,
  );
  db.close();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
