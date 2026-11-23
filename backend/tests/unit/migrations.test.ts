import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrations.js';
import { openDatabase } from '../../src/lib/db.js';

function freshDb() {
  const db = openDatabase(':memory:');
  migrate(db, new Date('2026-01-05T08:00:00Z'));
  db.prepare(
    `INSERT INTO users (account, display_name, role, password_hash, using_default_password, created_at, updated_at)
     VALUES ('teacher', '老師', 'TEACHER', 'x', 0, 't', 't')`,
  ).run();
  return db;
}

const NOW = '2026-01-05T08:00:00.000Z';
const SHEET_ID = 'a'.repeat(30);

function insertDraft(db: ReturnType<typeof freshDb>, id: string, status = 'OPEN') {
  db.prepare(
    `INSERT INTO import_drafts (id, user_id, status, spreadsheet_id, spreadsheet_title, sheet_id, sheet_title,
       source_url, sheets_json, snapshot_json, metadata_fingerprint, annotations_json, created_at, updated_at, expires_at)
     VALUES (?, 1, ?, ?, 'T', 0, '學習單', 'https://x', '[]', '{}', 'f', '{"questions":[]}', ?, ?, ?)`,
  ).run(id, status, SHEET_ID, NOW, NOW, NOW);
}

function insertSet(db: ReturnType<typeof freshDb>, id = 1) {
  db.prepare(
    `INSERT INTO question_sets (id, spreadsheet_id, spreadsheet_title, sheet_id, sheet_title, source_url,
       question_count, slot_count, imported_at, imported_by, draft_id)
     VALUES (?, ?, 'T', 0, '學習單', 'https://x', 1, 1, ?, 1, ?)`,
  ).run(id, SHEET_ID, NOW, `d-${id}`);
}

describe('migration version 3（data-model.md §1）', () => {
  it('建立 7 張表且重複執行為冪等（正常）', () => {
    const db = freshDb();
    expect(migrate(db)).toEqual([]);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((r) => r.name);
    for (const t of [
      'google_connections',
      'oauth_states',
      'import_drafts',
      'question_sets',
      'question_set_questions',
      'answer_slots',
      'question_events',
    ]) {
      expect(tables).toContain(t);
    }
  });

  it('question_sets.id 只能是 1（單例，邊界）', () => {
    const db = freshDb();
    insertSet(db, 1);
    expect(() => insertSet(db, 2)).toThrow();
  });

  it('同一老師只能有一筆 OPEN 草稿，CANCELLED 不受限（邊界）', () => {
    const db = freshDb();
    insertDraft(db, 'd1');
    expect(() => insertDraft(db, 'd2')).toThrow();
    insertDraft(db, 'd3', 'CANCELLED');
    insertDraft(db, 'd4', 'CONFIRMED');
  });

  it('import_drafts.status 只接受三個值（邊界）', () => {
    const db = freshDb();
    expect(() => insertDraft(db, 'd1', 'DONE')).toThrow();
  });

  it('question_events.type 只接受五個值（邊界）', () => {
    const db = freshDb();
    const ins = (type: string) =>
      db
        .prepare('INSERT INTO question_events (at, actor_user_id, type) VALUES (?, 1, ?)')
        .run(NOW, type);
    ins('IMPORTED');
    expect(() => ins('DELETED')).toThrow();
  });

  it('題號 1–20 字元、題目文字 1–2,000 字元、單題不得有共同題幹（邊界）', () => {
    const db = freshDb();
    insertSet(db);
    const q = (label: string, kind = 'SINGLE', stem: string | null = null) =>
      db
        .prepare(
          `INSERT INTO question_set_questions (question_set_id, position, question_key, label, kind, stem_text)
           VALUES (1, ?, ?, ?, ?, ?)`,
        )
        .run(
          Math.floor(Math.random() * 1e6) + 1,
          `k${Math.floor(Math.random() * 1e6)}`,
          label,
          kind,
          stem,
        );
    q('1');
    expect(() => q('')).toThrow();
    expect(() => q('題'.repeat(21))).toThrow();
    expect(() => q('3', 'SINGLE', '共同題幹')).toThrow();
    const gid = q('4', 'GROUP', '共同題幹').lastInsertRowid;
    const slot = (text: string, part = 0) =>
      db
        .prepare(
          `INSERT INTO answer_slots (question_id, part_index, question_text, question_cell, answer_cell, answer_had_content)
           VALUES (?, ?, ?, 'C5', 'H5', 0)`,
        )
        .run(gid, part, text);
    slot('x'.repeat(2000));
    expect(() => slot('x'.repeat(2001), 1)).toThrow();
    expect(() => slot('', 2)).toThrow();
    expect(() => slot('重複小題', 0)).toThrow();
  });

  it('刪除題目集時連帶刪除題目與作答項目', () => {
    const db = freshDb();
    insertSet(db);
    const id = db
      .prepare(
        `INSERT INTO question_set_questions (question_set_id, position, question_key, label, kind)
         VALUES (1, 1, 'abcd', '1', 'SINGLE')`,
      )
      .run().lastInsertRowid;
    db.prepare(
      `INSERT INTO answer_slots (question_id, part_index, question_text, question_cell, answer_cell, answer_had_content)
       VALUES (?, 0, '題目', 'C5', 'G5', 0)`,
    ).run(id);
    db.prepare('DELETE FROM question_sets').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM answer_slots').get()).toEqual({ n: 0 });
  });
});
