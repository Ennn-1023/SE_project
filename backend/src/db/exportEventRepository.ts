import type { Database } from '../lib/db.js';

/** data-model.md §1.3 export_events.type */
export type ExportEventType = 'WRITEBACK_SUCCEEDED' | 'WRITEBACK_FAILED' | 'CSV_EXPORTED';

/**
 * 寫回／匯出紀錄（diagrams/005-class.puml；data-model.md §1.3、FR-025）。
 * 只有計數與錯誤碼，介面上沒有任何可放答案、試算表內容或 token 的欄位。
 */
export interface ExportEvent {
  at: Date;
  actorId: number;
  activityId: string;
  type: ExportEventType;
  /** 寫回時為試算表識別；CSV 為 null */
  spreadsheetId: string | null;
  written: number;
  overwritten: number;
  skipped: number;
  /** CSV 資料列數（不含標題） */
  rows: number;
  /** 僅 WRITEBACK_FAILED 填錯誤碼 */
  failureCode: string | null;
}

interface EventRow {
  at: string;
  actor_id: number;
  activity_id: string;
  type: ExportEventType;
  spreadsheet_id: string | null;
  written: number;
  overwritten: number;
  skipped: number;
  rows: number;
  failure_code: string | null;
}

const nonNegative = (n: number) => (Number.isInteger(n) && n > 0 ? n : 0);

/** ExportEventRepository（005 組件圖）：寫回與匯出事件紀錄。 */
export class ExportEventRepository {
  constructor(private readonly db: Database) {}

  record(event: ExportEvent): void {
    this.db
      .prepare(
        `INSERT INTO export_events (at, actor_id, activity_id, type, spreadsheet_id, written, overwritten,
           skipped, rows, failure_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.at.toISOString(),
        event.actorId,
        event.activityId,
        event.type,
        event.spreadsheetId,
        nonNegative(event.written),
        nonNegative(event.overwritten),
        nonNegative(event.skipped),
        nonNegative(event.rows),
        event.type === 'WRITEBACK_FAILED' ? event.failureCode : null,
      );
  }

  listByActivity(activityId: string): ExportEvent[] {
    return (
      this.db
        .prepare(`SELECT * FROM export_events WHERE activity_id = ? ORDER BY id`)
        .all(activityId) as unknown as EventRow[]
    ).map((r) => ({
      at: new Date(r.at),
      actorId: r.actor_id,
      activityId: r.activity_id,
      type: r.type,
      spreadsheetId: r.spreadsheet_id,
      written: r.written,
      overwritten: r.overwritten,
      skipped: r.skipped,
      rows: r.rows,
      failureCode: r.failure_code,
    }));
  }
}
