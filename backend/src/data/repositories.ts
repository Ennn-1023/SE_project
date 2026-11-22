import type { ActivityPhase } from '@buzzer/shared';
import type { Db } from './db';
import { transaction } from './db';
import type {
  Activity,
  ClosedReason,
  Question,
  QuestionResult,
  Student,
  Submission,
  Team,
} from '../domain/types';

type Row = Record<string, unknown>;

const toActivity = (r: Row): Activity => ({
  id: String(r.id),
  phase: r.phase as ActivityPhase,
  currentQuestionId: (r.current_question_id as string | null) ?? null,
  endsAt: r.ends_at == null ? null : Number(r.ends_at),
});

const toQuestion = (r: Row): Question => ({
  questionId: String(r.question_id),
  activityId: String(r.activity_id),
  number: Number(r.number),
  text: String(r.text),
});

const toTeam = (r: Row): Team => ({
  teamId: String(r.team_id),
  activityId: String(r.activity_id),
  name: String(r.name),
});

const toStudent = (r: Row): Student => ({
  studentId: String(r.student_id),
  name: String(r.name),
  teamId: (r.team_id as string | null) ?? null,
});

const toSubmission = (r: Row): Submission => ({
  activityId: String(r.activity_id),
  questionId: String(r.question_id),
  teamId: String(r.team_id),
  studentId: String(r.student_id),
  answer: String(r.answer),
  receivedAt: Number(r.received_at),
  rank: Number(r.rank),
});

const toResult = (r: Row): QuestionResult => ({
  activityId: String(r.activity_id),
  questionId: String(r.question_id),
  answer: (r.answer as string | null) ?? null,
  winnerTeam: (r.winner_team as string | null) ?? null,
  submittedAt: r.submitted_at == null ? null : Number(r.submitted_at),
  closedReason: r.closed_reason as ClosedReason,
  closedAt: Number(r.closed_at),
});

/** 資料存取（data-model.md）。同一時間只有一場未結束的活動（FR-020b）。 */
export class Repository {
  constructor(private readonly db: Db) {}

  /** 取得目前活動：優先取未結束的那一場，否則取最近更新的一場 */
  getCurrentActivity(): Activity | null {
    const row =
      (this.db
        .prepare(`SELECT * FROM activities WHERE phase != 'ENDED' ORDER BY updated_at DESC LIMIT 1`)
        .get() as Row | undefined) ??
      (this.db.prepare(`SELECT * FROM activities ORDER BY updated_at DESC LIMIT 1`).get() as
        | Row
        | undefined);
    return row ? toActivity(row) : null;
  }

  saveActivity(a: Activity): void {
    this.db
      .prepare(
        `INSERT INTO activities (id, phase, current_question_id, ends_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET phase = excluded.phase,
           current_question_id = excluded.current_question_id,
           ends_at = excluded.ends_at, updated_at = excluded.updated_at`,
      )
      .run(a.id, a.phase, a.currentQuestionId, a.endsAt, Date.now());
  }

  getQuestion(questionId: string): Question | null {
    const row = this.db.prepare(`SELECT * FROM questions WHERE question_id = ?`).get(questionId) as
      | Row
      | undefined;
    return row ? toQuestion(row) : null;
  }

  listQuestions(activityId: string): Question[] {
    return (
      this.db
        .prepare(`SELECT * FROM questions WHERE activity_id = ? ORDER BY number`)
        .all(activityId) as Row[]
    ).map(toQuestion);
  }

  getTeam(teamId: string): Team | null {
    const row = this.db.prepare(`SELECT * FROM teams WHERE team_id = ?`).get(teamId) as
      | Row
      | undefined;
    return row ? toTeam(row) : null;
  }

  listTeams(activityId: string): Team[] {
    return (
      this.db.prepare(`SELECT * FROM teams WHERE activity_id = ? ORDER BY team_id`).all(activityId) as Row[]
    ).map(toTeam);
  }

  getStudent(studentId: string): Student | null {
    const row = this.db.prepare(`SELECT * FROM students WHERE student_id = ?`).get(studentId) as
      | Row
      | undefined;
    return row ? toStudent(row) : null;
  }

  listStudents(): Student[] {
    return (this.db.prepare(`SELECT * FROM students ORDER BY student_id`).all() as Row[]).map(toStudent);
  }

  insertTeam(t: Team): void {
    this.db
      .prepare(`INSERT INTO teams (team_id, activity_id, name) VALUES (?, ?, ?)`)
      .run(t.teamId, t.activityId, t.name);
  }

  insertStudent(s: Student): void {
    this.db
      .prepare(`INSERT INTO students (student_id, name, team_id) VALUES (?, ?, ?)`)
      .run(s.studentId, s.name, s.teamId);
  }

  insertQuestion(q: Question): void {
    this.db
      .prepare(`INSERT INTO questions (question_id, activity_id, number, text) VALUES (?, ?, ?, ?)`)
      .run(q.questionId, q.activityId, q.number, q.text);
  }

  hasResult(activityId: string, questionId: string): boolean {
    return (
      this.db
        .prepare(`SELECT 1 FROM question_results WHERE activity_id = ? AND question_id = ?`)
        .get(activityId, questionId) !== undefined
    );
  }

  getResult(activityId: string, questionId: string): QuestionResult | null {
    const row = this.db
      .prepare(`SELECT * FROM question_results WHERE activity_id = ? AND question_id = ?`)
      .get(activityId, questionId) as Row | undefined;
    return row ? toResult(row) : null;
  }

  listResults(activityId: string): QuestionResult[] {
    return (
      this.db
        .prepare(
          `SELECT r.* FROM question_results r JOIN questions q ON q.question_id = r.question_id
           WHERE r.activity_id = ? ORDER BY q.number`,
        )
        .all(activityId) as Row[]
    ).map(toResult);
  }

  listSubmissions(activityId: string, questionId: string): Submission[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM submissions WHERE activity_id = ? AND question_id = ? ORDER BY rank`,
        )
        .all(activityId, questionId) as Row[]
    ).map(toSubmission);
  }

  /** 題目結束時以單一交易寫入所有送出紀錄與一筆結果（FR-019、FR-020） */
  saveQuestionOutcome(submissions: Submission[], result: QuestionResult): void {
    transaction(this.db, () => {
      const ins = this.db.prepare(
        `INSERT INTO submissions (activity_id, question_id, team_id, student_id, answer, received_at, rank)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const s of submissions) {
        ins.run(s.activityId, s.questionId, s.teamId, s.studentId, s.answer, s.receivedAt, s.rank);
      }
      this.db
        .prepare(
          `INSERT INTO question_results
             (activity_id, question_id, answer, winner_team, submitted_at, closed_reason, closed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          result.activityId,
          result.questionId,
          result.answer,
          result.winnerTeam,
          result.submittedAt,
          result.closedReason,
          result.closedAt,
        );
    });
  }

  /** dev reset：刪除本活動所有送出與結果 */
  clearOutcomes(activityId: string): void {
    transaction(this.db, () => {
      this.db.prepare(`DELETE FROM submissions WHERE activity_id = ?`).run(activityId);
      this.db.prepare(`DELETE FROM question_results WHERE activity_id = ?`).run(activityId);
    });
  }
}
