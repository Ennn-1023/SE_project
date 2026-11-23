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
  {
    // 002-student-buzzer 的資料表（specs/002-student-buzzer/data-model.md）。
    // 組別與學生直接使用 users.group_number 與 users（整合後不另建 teams／students 表），
    // 因此 team_id／student_id 不設外鍵；team_id 為 `T{組別編號}`。
    version: 2,
    up: (db) => {
      db.exec(`
        CREATE TABLE activities (
          id                  TEXT PRIMARY KEY,
          phase               TEXT NOT NULL CHECK (phase IN ('WAITING','ANSWERING','CLOSED','ENDED')),
          current_question_id TEXT,
          ends_at             INTEGER,
          updated_at          INTEGER NOT NULL
        );

        CREATE TABLE questions (
          question_id TEXT PRIMARY KEY,
          activity_id TEXT NOT NULL REFERENCES activities(id),
          number      INTEGER NOT NULL CHECK (number >= 1),
          text        TEXT NOT NULL CHECK (length(text) > 0),
          UNIQUE (activity_id, number)
        );

        CREATE TABLE submissions (
          activity_id TEXT NOT NULL,
          question_id TEXT NOT NULL REFERENCES questions(question_id),
          team_id     TEXT NOT NULL,
          student_id  TEXT NOT NULL,
          answer      TEXT NOT NULL CHECK (length(answer) > 0),
          received_at INTEGER NOT NULL,
          rank        INTEGER NOT NULL CHECK (rank >= 1),
          PRIMARY KEY (activity_id, question_id, team_id),
          UNIQUE (activity_id, question_id, rank)
        );

        CREATE TABLE question_results (
          activity_id   TEXT NOT NULL,
          question_id   TEXT NOT NULL REFERENCES questions(question_id),
          answer        TEXT,
          winner_team   TEXT,
          submitted_at  INTEGER,
          closed_reason TEXT NOT NULL CHECK (closed_reason IN ('TIME_UP','MANUAL','ACTIVITY_ENDED')),
          closed_at     INTEGER NOT NULL,
          PRIMARY KEY (activity_id, question_id)
        );
      `);
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
