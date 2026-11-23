import { validateAnswer } from '@buzzer/shared';
import { AppError } from '../http/errors';
import type { ActivityStateMachine } from './activityStateMachine';
import type { Student, Submission } from './buzzerTypes';

/**
 * 作答中的送出（research.md R4）。送出只存在記憶體，題目結束時才寫入資料庫。
 * submit() 是同步函式：Node.js 單執行緒保證「檢查 + 寫入」不會被其他請求插入，
 * 因此順位就是伺服器處理的先後，不需要鎖。
 */
export class SubmissionService {
  private byTeam = new Map<string, Submission>();
  private questionId: string | null = null;

  constructor(private readonly machine: ActivityStateMachine) {}

  /** 題目開放時清空上一題的送出 */
  startQuestion(questionId: string): void {
    this.byTeam.clear();
    this.questionId = questionId;
  }

  clear(): void {
    this.byTeam.clear();
    this.questionId = null;
  }

  /** 判定順序見 contracts/rest-api.md「送出時的判定順序」 */
  submit(student: Student, questionId: string, rawAnswer: string): Submission {
    if (!student.teamId) throw new AppError('NO_TEAM');

    const check = validateAnswer(rawAnswer);
    if (!check.ok) throw new AppError(check.code, 'answer', { length: check.length });

    const activity = this.machine.activity;
    if (activity.phase === 'ENDED') throw new AppError('ACTIVITY_ENDED');
    // 剛結束的題目：以伺服器狀態為準拒絕（US3、FR-011）
    if (activity.phase === 'CLOSED' && activity.currentQuestionId === questionId) {
      throw new AppError('QUESTION_CLOSED');
    }
    if (
      activity.phase !== 'ANSWERING' ||
      activity.currentQuestionId !== questionId ||
      this.questionId !== questionId
    ) {
      throw new AppError('QUESTION_NOT_OPEN', 'questionId');
    }

    if (this.byTeam.has(student.teamId)) throw new AppError('ALREADY_SUBMITTED');

    const submission: Submission = {
      activityId: activity.id,
      questionId,
      teamId: student.teamId,
      studentId: student.studentId,
      answer: check.value,
      receivedAt: Date.now(),
      rank: this.byTeam.size + 1,
    };
    this.byTeam.set(student.teamId, submission);
    return submission;
  }

  forTeam(teamId: string): Submission | undefined {
    return this.byTeam.get(teamId);
  }

  /** 目前題目的所有送出，依 rank 排序 */
  all(): Submission[] {
    return [...this.byTeam.values()].sort((a, b) => a.rank - b.rank);
  }
}
