import type { ActivityPhase, PartAnswer } from '@buzzer/shared';
import type { Db } from './db';
import { transaction } from './db';
import type {
  Activity,
  ActivityQuestion,
  ClosedReason,
  ParticipatingTeam,
  QuestionPart,
  QuestionResult,
  Student,
  Submission,
  Team,
} from '../domain/buzzerTypes';

type Row = Record<string, unknown>;

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (v == null ? null : String(v));

const toActivity = (r: Row): Activity => ({
  id: String(r.id),
  phase: r.phase as ActivityPhase,
  currentQuestionId: str(r.current_question_id),
  openedAt: num(r.opened_at),
  endsAt: num(r.ends_at),
  startedAt: num(r.started_at),
  startedBy: num(r.started_by),
  endedAt: num(r.ended_at),
  sourceTitle: str(r.source_title),
  notice: str(r.notice),
});

const toQuestion = (r: Row): ActivityQuestion => ({
  questionId: String(r.question_id),
  activityId: String(r.activity_id),
  number: Number(r.number),
  position: Number(r.number),
  text: String(r.text),
  label: r.label == null ? String(r.number) : String(r.label),
  questionKey: str(r.question_key),
  kind: (r.kind as ActivityQuestion['kind']) ?? 'SINGLE',
  stem: str(r.stem),
  status: r.status as ActivityQuestion['status'],
  currentRound: Number(r.current_round ?? 0),
  seconds: num(r.seconds),
  openedAt: num(r.opened_at),
  closedAt: num(r.closed_at),
  closedReason: (r.closed_reason as ClosedReason | null) ?? null,
});

/** 組別編號 n ↔ 搶答的 teamId `T{n}`（整合 001 組別管理：組別即 users.group_number）。 */
export const teamIdOf = (groupNumber: number) => `T${groupNumber}`;
export function groupNumberOf(teamId: string): number | null {
  const m = /^T([1-9]\d*)$/.exec(teamId);
  return m ? Number(m[1]) : null;
}
export const teamNameOf = (groupNumber: number) => `第 ${groupNumber} 組`;
const teamOf = (groupNumber: number, activityId: string): Team => ({
  teamId: teamIdOf(groupNumber),
  activityId,
  name: teamNameOf(groupNumber),
});

const toStudent = (r: Row): Student => ({
  studentId: String(r.account),
  name: String(r.display_name),
  teamId: r.group_number == null ? null : teamIdOf(Number(r.group_number)),
});

const toSubmission = (r: Row, answers: PartAnswer[]): Submission => ({
  activityId: String(r.activity_id),
  questionId: String(r.question_id),
  teamId: String(r.team_id),
  studentId: String(r.student_id),
  answer: String(r.answer),
  answers,
  round: Number(r.round ?? 1),
  voided: Number(r.voided ?? 0) === 1,
  receivedAt: Number(r.received_at),
  rank: Number(r.rank),
});

const toResult = (r: Row, answers: PartAnswer[]): QuestionResult => ({
  activityId: String(r.activity_id),
  questionId: String(r.question_id),
  answer: str(r.answer),
  winnerTeam: str(r.winner_team),
  submittedAt: num(r.submitted_at),
  round: Number(r.round ?? 1),
  voided: Number(r.voided ?? 0) === 1,
  closedReason: r.closed_reason as ClosedReason,
  closedAt: Number(r.closed_at),
  answers,
});

/** 建立活動時寫入的一題（含小題） */
export interface NewActivityQuestion {
  questionId: string;
  position: number;
  label: string;
  text: string;
  questionKey: string | null;
  kind: ActivityQuestion['kind'];
  stem: string | null;
  parts: QuestionPart[];
}

/**
 * 資料存取（002 data-model；004 data-model.md §1）。同一時間只有一場未結束的活動（FR-003）。
 * 所有對外的送出與結果查詢只回傳未作廢（voided = 0）的資料（research.md R5）。
 */
export class Repository {
  constructor(private readonly db: Db) {}

  // ---------- 活動 ----------

  /** 取得目前活動：優先取未結束的那一場，否則取最近更新的一場；從未有活動時為 null */
  getCurrentActivity(): Activity | null {
    const row =
      (this.db
        .prepare(`SELECT * FROM activities WHERE phase != 'ENDED' ORDER BY updated_at DESC LIMIT 1`)
        .get() as Row | undefined) ??
      (this.db
        .prepare(`SELECT * FROM activities ORDER BY updated_at DESC, rowid DESC LIMIT 1`)
        .get() as Row | undefined);
    return row ? toActivity(row) : null;
  }

  hasRunningActivity(): boolean {
    return (
      this.db.prepare(`SELECT 1 FROM activities WHERE phase != 'ENDED' LIMIT 1`).get() !== undefined
    );
  }

  activityExists(id: string): boolean {
    return this.db.prepare(`SELECT 1 FROM activities WHERE id = ?`).get(id) !== undefined;
  }

  saveActivity(a: Activity): void {
    this.db
      .prepare(
        `INSERT INTO activities (id, phase, current_question_id, opened_at, ends_at, started_at, started_by,
           ended_at, source_title, notice, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET phase = excluded.phase,
           current_question_id = excluded.current_question_id, opened_at = excluded.opened_at,
           ends_at = excluded.ends_at, started_at = excluded.started_at, started_by = excluded.started_by,
           ended_at = excluded.ended_at, source_title = excluded.source_title, notice = excluded.notice,
           updated_at = excluded.updated_at`,
      )
      .run(
        a.id,
        a.phase,
        a.currentQuestionId,
        a.openedAt,
        a.endsAt,
        a.startedAt,
        a.startedBy,
        a.endedAt,
        a.sourceTitle,
        a.notice,
        Date.now(),
      );
  }

  /** 以單一交易建立活動與其題目快照（research.md R3、FR-002） */
  createActivity(activity: Activity, questions: NewActivityQuestion[]): void {
    transaction(this.db, () => {
      this.saveActivity(activity);
      const insQ = this.db.prepare(
        `INSERT INTO questions (question_id, activity_id, number, text, label, kind, stem, question_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insP = this.db.prepare(
        `INSERT INTO question_parts (question_id, part_index, part_label, question_text) VALUES (?, ?, ?, ?)`,
      );
      for (const q of questions) {
        insQ.run(q.questionId, activity.id, q.position, q.text, q.label, q.kind, q.stem, q.questionKey);
        for (const p of q.parts) insP.run(q.questionId, p.partIndex, p.partLabel, p.questionText);
      }
    });
  }

  // ---------- 活動題目 ----------

  getQuestion(questionId: string): ActivityQuestion | null {
    const row = this.db.prepare(`SELECT * FROM questions WHERE question_id = ?`).get(questionId) as
      | Row
      | undefined;
    return row ? toQuestion(row) : null;
  }

  listQuestions(activityId: string): ActivityQuestion[] {
    return (
      this.db
        .prepare(`SELECT * FROM questions WHERE activity_id = ? ORDER BY number`)
        .all(activityId) as Row[]
    ).map(toQuestion);
  }

  getQuestionParts(questionId: string): QuestionPart[] {
    return (
      this.db
        .prepare(`SELECT * FROM question_parts WHERE question_id = ? ORDER BY part_index`)
        .all(questionId) as Row[]
    ).map((r) => ({
      partIndex: Number(r.part_index),
      partLabel: str(r.part_label),
      questionText: String(r.question_text),
    }));
  }

  /** 更新題目的開放／結束狀態（data-model.md §1.2） */
  updateQuestionState(q: ActivityQuestion): void {
    this.db
      .prepare(
        `UPDATE questions SET status = ?, current_round = ?, seconds = ?, opened_at = ?, closed_at = ?,
           closed_reason = ? WHERE question_id = ?`,
      )
      .run(q.status, q.currentRound, q.seconds, q.openedAt, q.closedAt, q.closedReason, q.questionId);
  }

  // ---------- 參與組別 ----------

  saveParticipants(teams: ParticipatingTeam[]): void {
    const ins = this.db.prepare(
      `INSERT OR REPLACE INTO question_participants (activity_id, question_id, round, team_id, member_count)
       VALUES (?, ?, ?, ?, ?)`,
    );
    transaction(this.db, () => {
      for (const t of teams) ins.run(t.activityId, t.questionId, t.round, t.teamId, t.memberCount);
    });
  }

  listParticipants(activityId: string, questionId: string, round: number): ParticipatingTeam[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM question_participants WHERE activity_id = ? AND question_id = ? AND round = ?`,
        )
        .all(activityId, questionId, round) as Row[]
    )
      .map((r) => {
        const n = groupNumberOf(String(r.team_id)) ?? 0;
        return {
          activityId: String(r.activity_id),
          questionId: String(r.question_id),
          round: Number(r.round),
          teamId: String(r.team_id),
          teamName: teamNameOf(n),
          memberCount: Number(r.member_count),
        };
      })
      .sort((a, b) => (groupNumberOf(a.teamId) ?? 0) - (groupNumberOf(b.teamId) ?? 0));
  }

  // ---------- 組別與學生 ----------

  private groupCount(): number {
    const row = this.db.prepare(`SELECT group_count FROM group_settings WHERE id = 1`).get() as
      | Row
      | undefined;
    return row ? Number(row.group_count) : 0;
  }

  /** 組別來自 001 的組數設定：第 1..N 組；超出目前組數的 teamId 視為不存在 */
  getTeam(teamId: string): Team | null {
    const n = groupNumberOf(teamId);
    if (n === null || n > this.groupCount()) return null;
    return teamOf(n, this.getCurrentActivity()?.id ?? '');
  }

  listTeams(activityId: string): Team[] {
    return Array.from({ length: this.groupCount() }, (_, i) => teamOf(i + 1, activityId));
  }

  /** 每組目前的學生人數（只含 1..N 組） */
  memberCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    const n = this.groupCount();
    for (let i = 1; i <= n; i++) counts.set(teamIdOf(i), 0);
    const rows = this.db
      .prepare(
        `SELECT group_number, COUNT(*) AS c FROM users
         WHERE role = 'STUDENT' AND group_number IS NOT NULL GROUP BY group_number`,
      )
      .all() as Row[];
    for (const r of rows) {
      const id = teamIdOf(Number(r.group_number));
      if (counts.has(id)) counts.set(id, Number(r.c));
    }
    return counts;
  }

  /** 學生來自 001 的 users（role = STUDENT）；studentId 即學號（大寫） */
  getStudent(studentId: string): Student | null {
    const row = this.db
      .prepare(
        `SELECT account, display_name, group_number FROM users WHERE role = 'STUDENT' AND account = ?`,
      )
      .get(studentId.trim().toUpperCase()) as Row | undefined;
    return row ? toStudent(row) : null;
  }

  listStudents(): Student[] {
    return (
      this.db
        .prepare(
          `SELECT account, display_name, group_number FROM users WHERE role = 'STUDENT' ORDER BY account`,
        )
        .all() as Row[]
    ).map(toStudent);
  }

  // ---------- 送出與結果（只回傳未作廢） ----------

  private submissionParts(activityId: string, questionId: string, round: number): Map<string, PartAnswer[]> {
    const rows = this.db
      .prepare(
        `SELECT sp.team_id, sp.part_index, sp.answer, qp.part_label
         FROM submission_parts sp
         LEFT JOIN question_parts qp ON qp.question_id = sp.question_id AND qp.part_index = sp.part_index
         WHERE sp.activity_id = ? AND sp.question_id = ? AND sp.round = ? ORDER BY sp.part_index`,
      )
      .all(activityId, questionId, round) as Row[];
    const map = new Map<string, PartAnswer[]>();
    for (const r of rows) {
      const list = map.get(String(r.team_id)) ?? [];
      list.push({ partIndex: Number(r.part_index), partLabel: str(r.part_label), answer: String(r.answer) });
      map.set(String(r.team_id), list);
    }
    return map;
  }

  private resultParts(activityId: string, questionId: string, round: number): PartAnswer[] {
    return (
      this.db
        .prepare(
          `SELECT rp.part_index, rp.answer, qp.part_label FROM result_parts rp
           LEFT JOIN question_parts qp ON qp.question_id = rp.question_id AND qp.part_index = rp.part_index
           WHERE rp.activity_id = ? AND rp.question_id = ? AND rp.round = ? ORDER BY rp.part_index`,
        )
        .all(activityId, questionId, round) as Row[]
    ).map((r) => ({ partIndex: Number(r.part_index), partLabel: str(r.part_label), answer: String(r.answer) }));
  }

  hasResult(activityId: string, questionId: string): boolean {
    return (
      this.db
        .prepare(
          `SELECT 1 FROM question_results WHERE activity_id = ? AND question_id = ? AND voided = 0`,
        )
        .get(activityId, questionId) !== undefined
    );
  }

  getResult(activityId: string, questionId: string): QuestionResult | null {
    const row = this.db
      .prepare(
        `SELECT * FROM question_results WHERE activity_id = ? AND question_id = ? AND voided = 0`,
      )
      .get(activityId, questionId) as Row | undefined;
    return row ? toResult(row, this.resultParts(activityId, questionId, Number(row.round))) : null;
  }

  listResults(activityId: string): QuestionResult[] {
    return (
      this.db
        .prepare(
          `SELECT r.* FROM question_results r JOIN questions q ON q.question_id = r.question_id
           WHERE r.activity_id = ? AND r.voided = 0 ORDER BY q.number`,
        )
        .all(activityId) as Row[]
    ).map((r) =>
      toResult(r, this.resultParts(activityId, String(r.question_id), Number(r.round))),
    );
  }

  /** 該題有效（未作廢）輪次的送出，依 rank 排序 */
  listSubmissions(activityId: string, questionId: string): Submission[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM submissions WHERE activity_id = ? AND question_id = ? AND voided = 0 ORDER BY rank`,
      )
      .all(activityId, questionId) as Row[];
    if (rows.length === 0) return [];
    const parts = this.submissionParts(activityId, questionId, Number(rows[0]!.round));
    return rows.map((r) => toSubmission(r, parts.get(String(r.team_id)) ?? []));
  }

  /** 含作廢輪次的所有送出（只供紀錄查詢與測試） */
  listAllSubmissions(activityId: string, questionId: string): Submission[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM submissions WHERE activity_id = ? AND question_id = ? ORDER BY round, rank`,
      )
      .all(activityId, questionId) as Row[];
    return rows.map((r) =>
      toSubmission(
        r,
        this.submissionParts(activityId, questionId, Number(r.round)).get(String(r.team_id)) ?? [],
      ),
    );
  }

  /**
   * 題目結束：單一交易中作廢同題較早輪次（submissions.voided、question_results.voided），
   * 再寫入本輪送出、小題答案、結果與成功組小題答案（research.md R5、FR-007a）。
   */
  saveQuestionOutcome(submissions: Submission[], result: QuestionResult): void {
    transaction(this.db, () => {
      const { activityId, questionId, round } = result;
      this.db
        .prepare(
          `UPDATE submissions SET voided = 1 WHERE activity_id = ? AND question_id = ? AND round < ?`,
        )
        .run(activityId, questionId, round);
      this.db
        .prepare(
          `UPDATE question_results SET voided = 1 WHERE activity_id = ? AND question_id = ? AND round < ?`,
        )
        .run(activityId, questionId, round);
      const ins = this.db.prepare(
        `INSERT INTO submissions (activity_id, question_id, round, team_id, student_id, answer, received_at, rank, voided)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      );
      const insPart = this.db.prepare(
        `INSERT INTO submission_parts (activity_id, question_id, round, team_id, part_index, answer)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const s of submissions) {
        ins.run(s.activityId, s.questionId, round, s.teamId, s.studentId, s.answer, s.receivedAt, s.rank);
        for (const p of s.answers) insPart.run(s.activityId, s.questionId, round, s.teamId, p.partIndex, p.answer);
      }
      this.db
        .prepare(
          `INSERT INTO question_results
             (activity_id, question_id, round, answer, winner_team, submitted_at, closed_reason, closed_at, voided)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        )
        .run(
          activityId,
          questionId,
          round,
          result.answer,
          result.winnerTeam,
          result.submittedAt,
          result.closedReason,
          result.closedAt,
        );
      const insResult = this.db.prepare(
        `INSERT INTO result_parts (activity_id, question_id, round, part_index, answer) VALUES (?, ?, ?, ?, ?)`,
      );
      for (const p of result.answers) insResult.run(activityId, questionId, round, p.partIndex, p.answer);
    });
  }

  /** dev reset：刪除本活動所有送出、結果與參與組別，題目回到未開放 */
  clearOutcomes(activityId: string): void {
    transaction(this.db, () => {
      for (const table of ['submissions', 'submission_parts', 'question_results', 'result_parts', 'question_participants']) {
        this.db.prepare(`DELETE FROM ${table} WHERE activity_id = ?`).run(activityId);
      }
      this.db
        .prepare(
          `UPDATE questions SET status = 'NOT_OPENED', current_round = 0, seconds = NULL, opened_at = NULL,
             closed_at = NULL, closed_reason = NULL WHERE activity_id = ?`,
        )
        .run(activityId);
    });
  }
}
