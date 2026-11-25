import type { CellRef } from '@buzzer/shared';
import type { Database } from '../lib/db.js';

/** 寫回目標（diagrams/005-class.puml；data-model.md §1.1 activities.*） */
export interface WritebackTarget {
  activityId: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetId: number;
  /** 開始活動時的分頁名稱（顯示用；寫回以 sheetId 找分頁） */
  sheetTitle: string;
  sourceUrl: string;
}

/** 作答格後備位置（diagrams/005-class.puml；data-model.md §1.2 question_parts.answer_cell） */
export interface AnswerSlotFallback {
  activityId: string;
  questionKey: string;
  partIndex: number;
  /** 匯入當下記錄的作答格位置；v5 之前的活動為 null */
  importedCell: CellRef | null;
}

interface TargetRow {
  id: string;
  spreadsheet_id: string | null;
  spreadsheet_title: string | null;
  sheet_id: number | null;
  sheet_title: string | null;
  source_url: string | null;
}

/**
 * WritebackTargetRepository（005 組件圖）：唯讀取得活動開始時記錄的寫回目標與作答格後備位置。
 * 寫入在 004 的 Repository.createActivity（同一個交易）完成。
 */
export class WritebackTargetRepository {
  constructor(private readonly db: Database) {}

  getTarget(activityId: string): WritebackTarget | null {
    const r = this.db
      .prepare(
        `SELECT id, spreadsheet_id, spreadsheet_title, sheet_id, sheet_title, source_url
         FROM activities WHERE id = ?`,
      )
      .get(activityId) as TargetRow | undefined;
    if (!r || r.spreadsheet_id === null || r.source_url === null) return null;
    return {
      activityId: r.id,
      spreadsheetId: r.spreadsheet_id,
      spreadsheetTitle: r.spreadsheet_title ?? '',
      sheetId: Number(r.sheet_id),
      sheetTitle: r.sheet_title ?? '',
      sourceUrl: r.source_url,
    };
  }

  getFallbacks(activityId: string): AnswerSlotFallback[] {
    const rows = this.db
      .prepare(
        `SELECT q.question_key, p.part_index, p.answer_cell
         FROM question_parts p JOIN questions q ON q.question_id = p.question_id
         WHERE q.activity_id = ? AND q.question_key IS NOT NULL
         ORDER BY q.number, p.part_index`,
      )
      .all(activityId) as {
      question_key: string;
      part_index: number;
      answer_cell: string | null;
    }[];
    return rows.map((r) => ({
      activityId,
      questionKey: r.question_key,
      partIndex: Number(r.part_index),
      importedCell: r.answer_cell,
    }));
  }
}
