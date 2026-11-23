import type { Database } from '../lib/db.js';
import { transaction } from '../lib/db.js';

/** 依 data-model.md 建立資料表。重複執行為冪等。 */
const MIGRATIONS: { version: number; up: (db: Database, now: string) => void }[] = [
  {
    version: 1,
    up: (db, now) => {
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 50),
          role TEXT NOT NULL CHECK (role IN ('TEACHER','STUDENT')),
          password_hash TEXT NOT NULL,
          using_default_password INTEGER NOT NULL CHECK (using_default_password IN (0,1)),
          group_number INTEGER CHECK (group_number IS NULL OR group_number >= 1),
          failed_login_count INTEGER NOT NULL DEFAULT 0,
          failed_window_started_at TEXT,
          locked_until TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (role = 'STUDENT' OR group_number IS NULL)
        );
        CREATE INDEX idx_users_role_group ON users(role, group_number);

        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          last_active_at TEXT NOT NULL,
          revoked_at TEXT
        );
        CREATE INDEX idx_sessions_user ON sessions(user_id);

        CREATE TABLE group_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          group_count INTEGER NOT NULL DEFAULT 0 CHECK (group_count BETWEEN 0 AND 50),
          updated_at TEXT NOT NULL
        );
      `);
      db.prepare('INSERT INTO group_settings (id, group_count, updated_at) VALUES (1, 0, ?)').run(
        now,
      );
    },
  },
];

export function migrate(db: Database, now: Date = new Date()): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  );
  const ran: number[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    transaction(db, () => {
      m.up(db, now.toISOString());
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        m.version,
        now.toISOString(),
      );
    });
    ran.push(m.version);
  }
  return ran;
}
