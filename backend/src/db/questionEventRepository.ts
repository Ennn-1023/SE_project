import type { QuestionEventRepository as Port } from '../domain/questionPorts.js';
import type { QuestionEvent } from '../domain/questionTypes.js';
import type { Database } from '../lib/db.js';

/** QuestionEventRepository（data-model.md §1.7 `question_events`）：不寫入 token 或學習單內容（FR-032）。 */
export class QuestionEventRepository implements Port {
  constructor(private readonly db: Database) {}

  record(e: QuestionEvent): void {
    this.db
      .prepare(
        `INSERT INTO question_events (at, actor_user_id, type, spreadsheet_id, sheet_title, question_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.at.toISOString(),
        e.actorUserId,
        e.type,
        e.spreadsheetId,
        e.sheetTitle,
        e.questionCount,
      );
  }
}
