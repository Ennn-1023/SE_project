import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/**
 * 開啟 SQLite（Node 內建 node:sqlite，同步 API）並建立 schema（data-model.md）。
 * 測試使用 ':memory:'。
 */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

/** 以單一交易執行；任何錯誤都會 ROLLBACK 後再拋出 */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS activities (
  id                  TEXT PRIMARY KEY,
  phase               TEXT NOT NULL CHECK (phase IN ('WAITING','ANSWERING','CLOSED','ENDED')),
  current_question_id TEXT,
  ends_at             INTEGER,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  question_id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id),
  number      INTEGER NOT NULL CHECK (number >= 1),
  text        TEXT NOT NULL CHECK (length(text) > 0),
  UNIQUE (activity_id, number)
);

CREATE TABLE IF NOT EXISTS teams (
  team_id     TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id),
  name        TEXT NOT NULL CHECK (length(name) > 0)
);

CREATE TABLE IF NOT EXISTS students (
  student_id TEXT PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(name) > 0),
  team_id    TEXT REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  activity_id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES questions(question_id),
  team_id     TEXT NOT NULL REFERENCES teams(team_id),
  student_id  TEXT NOT NULL REFERENCES students(student_id),
  answer      TEXT NOT NULL CHECK (length(answer) > 0),
  received_at INTEGER NOT NULL,
  rank        INTEGER NOT NULL CHECK (rank >= 1),
  PRIMARY KEY (activity_id, question_id, team_id),
  UNIQUE (activity_id, question_id, rank)
);

CREATE TABLE IF NOT EXISTS question_results (
  activity_id   TEXT NOT NULL,
  question_id   TEXT NOT NULL REFERENCES questions(question_id),
  answer        TEXT,
  winner_team   TEXT REFERENCES teams(team_id),
  submitted_at  INTEGER,
  closed_reason TEXT NOT NULL CHECK (closed_reason IN ('TIME_UP','MANUAL','ACTIVITY_ENDED')),
  closed_at     INTEGER NOT NULL,
  PRIMARY KEY (activity_id, question_id)
);
`;
