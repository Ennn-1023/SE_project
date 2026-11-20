import type { DatabaseSync } from "node:sqlite";

/**
 * 資料表定義（data-model.md）。以 PRAGMA user_version 記錄已套用的版本。
 * 欄位對應：
 * - users：User.id, User.username, User.displayName, User.role, User.groupLabel,
 *   User.passwordHash, User.usesDefaultPassword, User.passwordChangedAt, User.createdById, User.createdAt
 * - sessions：Session.id, Session.tokenHash, Session.userId, Session.createdAt, Session.lastSeenAt, Session.expiresAt
 * - security_events：SecurityEvent.id, SecurityEvent.type, SecurityEvent.actorUsername,
 *   SecurityEvent.targetUsername, SecurityEvent.occurredAt
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 50),
    role TEXT NOT NULL CHECK (role IN ('TEACHER', 'STUDENT')),
    group_label TEXT CHECK (group_label IS NULL OR length(group_label) BETWEEN 1 AND 20),
    password_hash TEXT NOT NULL,
    uses_default_password INTEGER NOT NULL CHECK (uses_default_password IN (0, 1)),
    password_changed_at TEXT NOT NULL,
    created_by_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user_id ON sessions(user_id);

  CREATE TABLE security_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN (
      'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_CHANGED',
      'PASSWORD_RESET', 'STUDENT_CREATED', 'STUDENT_DELETED'
    )),
    actor_username TEXT,
    target_username TEXT,
    occurred_at TEXT NOT NULL
  );
  `,
];

export function migrate(db: DatabaseSync): number {
  db.exec("PRAGMA foreign_keys = ON;");
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]!;
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    version += 1;
  }
  return version;
}
