import type { QuestionSetRepository as Port } from '../domain/questionPorts.js';
import type { ImportedQuestion, QuestionSetRecord } from '../domain/questionTypes.js';
import type { Database } from '../lib/db.js';

interface SetRow {
  spreadsheet_id: string;
  spreadsheet_title: string;
  sheet_id: number;
  sheet_title: string;
  source_url: string;
  question_count: number;
  slot_count: number;
  imported_at: string;
  imported_by: number;
  draft_id: string;
}

interface QuestionRow {
  id: number;
  position: number;
  question_key: string;
  label: string;
  kind: 'SINGLE' | 'GROUP';
  stem_text: string | null;
  stem_cell: string | null;
}

interface SlotRow {
  question_id: number;
  part_index: number;
  part_label: string | null;
  question_text: string;
  question_cell: string;
  answer_cell: string;
  answer_had_content: number;
}

/**
 * QuestionSetRepository（data-model.md §1.4～§1.6）：只保留一份題目集（id = 1）。
 * replace 須在呼叫端的交易中執行（QuestionImportService.confirm）。
 */
export class QuestionSetRepository implements Port {
  constructor(private readonly db: Database) {}

  findCurrent(): QuestionSetRecord | null {
    const set = this.db.prepare('SELECT * FROM question_sets WHERE id = 1').get() as
      SetRow | undefined;
    if (!set) return null;
    const questions = this.db
      .prepare('SELECT * FROM question_set_questions WHERE question_set_id = 1 ORDER BY position')
      .all() as unknown as QuestionRow[];
    const slots = this.db
      .prepare(
        `SELECT s.* FROM answer_slots s JOIN question_set_questions q ON q.id = s.question_id
         WHERE q.question_set_id = 1 ORDER BY q.position, s.part_index`,
      )
      .all() as unknown as SlotRow[];
    return {
      set: {
        source: {
          spreadsheetId: set.spreadsheet_id,
          spreadsheetTitle: set.spreadsheet_title,
          sheetId: set.sheet_id,
          sheetTitle: set.sheet_title,
          sourceUrl: set.source_url,
        },
        questionCount: set.question_count,
        slotCount: set.slot_count,
        importedAt: new Date(set.imported_at),
        importedBy: set.imported_by,
        draftId: set.draft_id,
      },
      questions: questions.map((q): ImportedQuestion => ({
        position: q.position,
        questionKey: q.question_key,
        label: q.label,
        kind: q.kind,
        stemText: q.stem_text,
        stemCell: q.stem_cell,
        slots: slots
          .filter((s) => s.question_id === q.id)
          .map((s) => ({
            partIndex: s.part_index,
            partLabel: s.part_label,
            questionText: s.question_text,
            questionCell: s.question_cell,
            answerCell: s.answer_cell,
            answerHadContent: s.answer_had_content === 1,
          })),
      })),
    };
  }

  replace({ set, questions }: QuestionSetRecord): void {
    this.clear();
    this.db
      .prepare(
        `INSERT INTO question_sets (id, spreadsheet_id, spreadsheet_title, sheet_id, sheet_title, source_url,
           question_count, slot_count, imported_at, imported_by, draft_id)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        set.source.spreadsheetId,
        set.source.spreadsheetTitle,
        set.source.sheetId,
        set.source.sheetTitle,
        set.source.sourceUrl,
        set.questionCount,
        set.slotCount,
        set.importedAt.toISOString(),
        set.importedBy,
        set.draftId,
      );
    const insertQuestion = this.db.prepare(
      `INSERT INTO question_set_questions (question_set_id, position, question_key, label, kind, stem_text, stem_cell)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
    );
    const insertSlot = this.db.prepare(
      `INSERT INTO answer_slots (question_id, part_index, part_label, question_text, question_cell,
         answer_cell, answer_had_content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const q of questions) {
      const id = insertQuestion.run(
        q.position,
        q.questionKey,
        q.label,
        q.kind,
        q.stemText,
        q.stemCell,
      ).lastInsertRowid;
      for (const s of q.slots) {
        insertSlot.run(
          id,
          s.partIndex,
          s.partLabel,
          s.questionText,
          s.questionCell,
          s.answerCell,
          s.answerHadContent ? 1 : 0,
        );
      }
    }
  }

  clear(): void {
    this.db.prepare('DELETE FROM question_sets').run();
  }
}
