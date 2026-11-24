import type { ActivityEvent } from '../domain/buzzerTypes.js';
import type { Database } from '../lib/db.js';

interface EventRow {
  activity_id: string;
  at: string;
  actor_id: number | null;
  type: ActivityEvent['type'];
  question_id: string | null;
  detail: string | null;
}

/**
 * ActivityEventRepository（004 data-model.md §1.9、FR-029）：活動事件紀錄。
 * detail 只記錄秒數、結束原因、組名等，呼叫端不得放入答案內容。
 */
export class ActivityEventRepository {
  constructor(private readonly db: Database) {}

  append(event: ActivityEvent): void {
    this.db
      .prepare(
        `INSERT INTO activity_events (activity_id, at, actor_id, type, question_id, detail)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.activityId,
        event.at.toISOString(),
        event.actorId,
        event.type,
        event.questionId,
        event.detail,
      );
  }

  listByActivity(activityId: string): ActivityEvent[] {
    return (
      this.db
        .prepare(`SELECT * FROM activity_events WHERE activity_id = ? ORDER BY id`)
        .all(activityId) as unknown as EventRow[]
    ).map((r) => ({
      activityId: r.activity_id,
      at: new Date(r.at),
      actorId: r.actor_id,
      type: r.type,
      questionId: r.question_id,
      detail: r.detail,
    }));
  }
}
