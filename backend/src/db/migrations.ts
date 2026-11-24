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
  {
    // 003-sheets-question-import（specs/003-sheets-question-import/data-model.md §1）。
    // 題目集（question_sets）與 002 的活動題目（questions）分開，F5 建立活動時再複製。
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE google_connections (
          user_id                 INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          google_email            TEXT NOT NULL CHECK (length(google_email) BETWEEN 1 AND 320),
          refresh_token_enc       TEXT NOT NULL,
          access_token_enc        TEXT,
          access_token_expires_at TEXT,
          scopes                  TEXT NOT NULL,
          connected_at            TEXT NOT NULL,
          last_used_at            TEXT NOT NULL
        );

        CREATE TABLE oauth_states (
          state             TEXT PRIMARY KEY,
          user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_id        TEXT NOT NULL,
          code_verifier_enc TEXT NOT NULL,
          created_at        TEXT NOT NULL,
          expires_at        TEXT NOT NULL
        );

        CREATE TABLE import_drafts (
          id                   TEXT PRIMARY KEY,
          user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status               TEXT NOT NULL CHECK (status IN ('OPEN','CONFIRMED','CANCELLED')),
          spreadsheet_id       TEXT NOT NULL CHECK (length(spreadsheet_id) BETWEEN 20 AND 100),
          spreadsheet_title    TEXT NOT NULL,
          sheet_id             INTEGER NOT NULL CHECK (sheet_id >= 0),
          sheet_title          TEXT NOT NULL,
          source_url           TEXT NOT NULL CHECK (length(source_url) <= 2000),
          sheets_json          TEXT NOT NULL,
          snapshot_json        TEXT NOT NULL,
          metadata_fingerprint TEXT NOT NULL,
          annotations_json     TEXT NOT NULL,
          restored_count       INTEGER NOT NULL DEFAULT 0 CHECK (restored_count >= 0),
          revision             INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
          created_at           TEXT NOT NULL,
          updated_at           TEXT NOT NULL,
          expires_at           TEXT NOT NULL
        );
        CREATE UNIQUE INDEX idx_import_drafts_open_user ON import_drafts(user_id) WHERE status = 'OPEN';

        CREATE TABLE question_sets (
          id                INTEGER PRIMARY KEY CHECK (id = 1),
          spreadsheet_id    TEXT NOT NULL,
          spreadsheet_title TEXT NOT NULL,
          sheet_id          INTEGER NOT NULL,
          sheet_title       TEXT NOT NULL,
          source_url        TEXT NOT NULL,
          question_count    INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 200),
          slot_count        INTEGER NOT NULL CHECK (slot_count BETWEEN 1 AND 2000),
          imported_at       TEXT NOT NULL,
          imported_by       INTEGER NOT NULL REFERENCES users(id),
          draft_id          TEXT NOT NULL UNIQUE
        );

        CREATE TABLE question_set_questions (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          question_set_id INTEGER NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
          position        INTEGER NOT NULL CHECK (position >= 1),
          question_key    TEXT NOT NULL CHECK (length(question_key) BETWEEN 4 AND 12),
          label           TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 20),
          kind            TEXT NOT NULL CHECK (kind IN ('SINGLE','GROUP')),
          stem_text       TEXT CHECK (stem_text IS NULL OR length(stem_text) BETWEEN 1 AND 2000),
          stem_cell       TEXT,
          UNIQUE (question_set_id, position),
          UNIQUE (question_set_id, question_key),
          UNIQUE (question_set_id, label),
          CHECK (kind = 'GROUP' OR (stem_text IS NULL AND stem_cell IS NULL))
        );

        CREATE TABLE answer_slots (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          question_id        INTEGER NOT NULL REFERENCES question_set_questions(id) ON DELETE CASCADE,
          part_index         INTEGER NOT NULL CHECK (part_index BETWEEN 0 AND 9),
          part_label         TEXT,
          question_text      TEXT NOT NULL CHECK (length(question_text) BETWEEN 1 AND 2000),
          question_cell      TEXT NOT NULL,
          answer_cell        TEXT NOT NULL,
          answer_had_content INTEGER NOT NULL CHECK (answer_had_content IN (0,1)),
          UNIQUE (question_id, part_index)
        );

        CREATE TABLE question_events (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          at             TEXT NOT NULL,
          actor_user_id  INTEGER NOT NULL REFERENCES users(id),
          type           TEXT NOT NULL CHECK (type IN ('GOOGLE_CONNECTED','GOOGLE_DISCONNECTED','IMPORTED','REIMPORTED','CLEARED')),
          spreadsheet_id TEXT,
          sheet_title    TEXT,
          question_count INTEGER
        );
      `);
    },
  },
  {
    // 004-activity-control-monitor（specs/004-activity-control-monitor/data-model.md §1）：
    // 活動生命週期、活動題目（快照）、小題、參與組別、輪次與作廢、活動事件。
    version: 4,
    up: (db, now) => {
      const nowMs = Date.parse(now);
      db.exec(`
        ALTER TABLE activities ADD COLUMN opened_at INTEGER;
        ALTER TABLE activities ADD COLUMN started_at INTEGER;
        ALTER TABLE activities ADD COLUMN started_by INTEGER;
        ALTER TABLE activities ADD COLUMN ended_at INTEGER;
        ALTER TABLE activities ADD COLUMN source_title TEXT;
        ALTER TABLE activities ADD COLUMN notice TEXT;

        ALTER TABLE questions ADD COLUMN label TEXT CHECK (label IS NULL OR length(label) BETWEEN 1 AND 20);
        ALTER TABLE questions ADD COLUMN kind TEXT NOT NULL DEFAULT 'SINGLE' CHECK (kind IN ('SINGLE','GROUP'));
        ALTER TABLE questions ADD COLUMN stem TEXT;
        ALTER TABLE questions ADD COLUMN question_key TEXT;
        ALTER TABLE questions ADD COLUMN status TEXT NOT NULL DEFAULT 'NOT_OPENED'
          CHECK (status IN ('NOT_OPENED','ANSWERING','CLOSED'));
        ALTER TABLE questions ADD COLUMN current_round INTEGER NOT NULL DEFAULT 0 CHECK (current_round >= 0);
        ALTER TABLE questions ADD COLUMN seconds INTEGER CHECK (seconds IS NULL OR seconds BETWEEN 5 AND 600);
        ALTER TABLE questions ADD COLUMN opened_at INTEGER;
        ALTER TABLE questions ADD COLUMN closed_at INTEGER;
        ALTER TABLE questions ADD COLUMN closed_reason TEXT
          CHECK (closed_reason IS NULL OR closed_reason IN ('TIME_UP','MANUAL','ACTIVITY_ENDED'));

        UPDATE questions SET label = CAST(number AS TEXT);

        CREATE TABLE question_parts (
          question_id   TEXT NOT NULL REFERENCES questions(question_id),
          part_index    INTEGER NOT NULL CHECK (part_index BETWEEN 0 AND 9),
          part_label    TEXT,
          question_text TEXT NOT NULL CHECK (length(question_text) BETWEEN 1 AND 2000),
          PRIMARY KEY (question_id, part_index)
        );
        INSERT INTO question_parts (question_id, part_index, part_label, question_text)
          SELECT question_id, 0, NULL, substr(text, 1, 2000) FROM questions;

        CREATE TABLE question_participants (
          activity_id  TEXT NOT NULL,
          question_id  TEXT NOT NULL,
          round        INTEGER NOT NULL CHECK (round >= 1),
          team_id      TEXT NOT NULL,
          member_count INTEGER NOT NULL CHECK (member_count >= 1),
          PRIMARY KEY (activity_id, question_id, round, team_id)
        );

        CREATE TABLE submissions_v4 (
          activity_id TEXT NOT NULL,
          question_id TEXT NOT NULL REFERENCES questions(question_id),
          round       INTEGER NOT NULL DEFAULT 1 CHECK (round >= 1),
          team_id     TEXT NOT NULL,
          student_id  TEXT NOT NULL,
          answer      TEXT NOT NULL CHECK (length(answer) > 0),
          received_at INTEGER NOT NULL,
          rank        INTEGER NOT NULL CHECK (rank >= 1),
          voided      INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0,1)),
          PRIMARY KEY (activity_id, question_id, round, team_id),
          UNIQUE (activity_id, question_id, round, rank)
        );
        INSERT INTO submissions_v4 (activity_id, question_id, round, team_id, student_id, answer, received_at, rank, voided)
          SELECT activity_id, question_id, 1, team_id, student_id, answer, received_at, rank, 0 FROM submissions;
        DROP TABLE submissions;
        ALTER TABLE submissions_v4 RENAME TO submissions;

        CREATE TABLE submission_parts (
          activity_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          round       INTEGER NOT NULL CHECK (round >= 1),
          team_id     TEXT NOT NULL,
          part_index  INTEGER NOT NULL CHECK (part_index BETWEEN 0 AND 9),
          answer      TEXT NOT NULL CHECK (length(answer) BETWEEN 1 AND 500),
          PRIMARY KEY (activity_id, question_id, round, team_id, part_index)
        );
        INSERT INTO submission_parts (activity_id, question_id, round, team_id, part_index, answer)
          SELECT activity_id, question_id, 1, team_id, 0, answer FROM submissions;

        CREATE TABLE question_results_v4 (
          activity_id   TEXT NOT NULL,
          question_id   TEXT NOT NULL REFERENCES questions(question_id),
          round         INTEGER NOT NULL DEFAULT 1 CHECK (round >= 1),
          answer        TEXT,
          winner_team   TEXT,
          submitted_at  INTEGER,
          closed_reason TEXT NOT NULL CHECK (closed_reason IN ('TIME_UP','MANUAL','ACTIVITY_ENDED')),
          closed_at     INTEGER NOT NULL,
          voided        INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0,1)),
          PRIMARY KEY (activity_id, question_id, round)
        );
        INSERT INTO question_results_v4 (activity_id, question_id, round, answer, winner_team, submitted_at, closed_reason, closed_at, voided)
          SELECT activity_id, question_id, 1, answer, winner_team, submitted_at, closed_reason, closed_at, 0 FROM question_results;
        DROP TABLE question_results;
        ALTER TABLE question_results_v4 RENAME TO question_results;
        CREATE UNIQUE INDEX idx_question_results_valid
          ON question_results(activity_id, question_id) WHERE voided = 0;

        CREATE TABLE result_parts (
          activity_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          round       INTEGER NOT NULL CHECK (round >= 1),
          part_index  INTEGER NOT NULL CHECK (part_index BETWEEN 0 AND 9),
          answer      TEXT NOT NULL,
          PRIMARY KEY (activity_id, question_id, round, part_index)
        );
        INSERT INTO result_parts (activity_id, question_id, round, part_index, answer)
          SELECT activity_id, question_id, 1, 0, answer FROM question_results WHERE answer IS NOT NULL;

        UPDATE questions SET status = 'CLOSED', current_round = 1,
          closed_reason = (SELECT r.closed_reason FROM question_results r WHERE r.question_id = questions.question_id),
          closed_at = (SELECT r.closed_at FROM question_results r WHERE r.question_id = questions.question_id)
          WHERE question_id IN (SELECT question_id FROM question_results);

        CREATE TABLE activity_events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          activity_id TEXT NOT NULL,
          at          TEXT NOT NULL,
          actor_id    INTEGER,
          type        TEXT NOT NULL CHECK (type IN ('STARTED','QUESTION_OPENED','QUESTION_REOPENED',
                        'QUESTION_CLOSED','BACK_TO_WAITING','ENDED','RESTART_CANCELLED')),
          question_id TEXT,
          detail      TEXT
        );
        CREATE INDEX idx_activity_events_activity ON activity_events(activity_id, id);
      `);
      // 002 的 mock 活動（A1）在正式流程中不再使用：未結束者標為結束（research.md R2）
      db.prepare(
        `UPDATE activities SET phase = 'ENDED', current_question_id = NULL, ends_at = NULL,
           ended_at = ?, updated_at = ? WHERE id = 'A1' AND phase != 'ENDED'`,
      ).run(nowMs, nowMs);
    },
  },
];

/** 套用尚未執行的 migration；`upTo` 供測試模擬舊版本資料庫（預設全部）。 */
export function migrate(db: Database, now: Date = new Date(), upTo = Infinity): number[] {
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
    if (applied.has(m.version) || m.version > upTo) continue;
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
