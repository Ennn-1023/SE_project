import { joinPartAnswers, validatePartAnswers, type PartSpec } from '@buzzer/shared';
import { AppError } from '../http/errors';
import type { ActivityStateMachine } from './activityStateMachine';
import type { Student, Submission } from './buzzerTypes';

/**
 * 作答中的送出（002 research.md R4；004 research.md R6）。送出只存在記憶體，題目結束時才寫入資料庫。
 * submit() 是同步函式：Node.js 單執行緒保證「檢查 + 寫入」不會被其他請求插入，
 * 因此順位就是伺服器處理的先後，不需要鎖。
 */
export class SubmissionService {
  private byTeam = new Map<string, Submission>();
  private questionId: string | null = null;
  private round = 0;
  private parts: PartSpec[] = [{ partIndex: 0, partLabel: null }];

  constructor(private readonly machine: ActivityStateMachine) {}

  /** 題目（或新一輪）開放時清空上一輪的送出，並記住本題的小題（驗證答案數量與標籤用） */
  startQuestion(questionId: string, round: number, parts: PartSpec[]): void {
    this.byTeam.clear();
    this.questionId = questionId;
    this.round = round;
    this.parts = parts.length > 0 ? parts : [{ partIndex: 0, partLabel: null }];
  }

  clear(): void {
    this.byTeam.clear();
    this.questionId = null;
    this.round = 0;
  }

  /**
   * 判定順序見 002 contracts/rest-api.md「送出時的判定順序」：組別 → 答案驗證 → 階段。
   * answers 為依小題的答案陣列（單題為長度 1）。題目不是本輪題目時無法得知小題，直接以階段判定。
   */
  submit(student: Student, questionId: string, answers: unknown): Submission {
    if (!student.teamId) throw new AppError('NO_TEAM');

    let validated: ReturnType<typeof validatePartAnswers> | null = null;
    if (questionId === this.questionId) {
      validated = validatePartAnswers(answers, this.parts);
      if (!validated.ok) {
        if (validated.code === 'PART_COUNT_MISMATCH') {
          throw new AppError('PART_COUNT_MISMATCH', 'answers', {
            expected: validated.expected,
            actual: validated.actual,
          });
        }
        const single = this.parts.length === 1 && this.parts[0]!.partLabel === null;
        // 單題沿用 002 的錯誤碼與欄位，題組指出是哪一小題
        if (single) {
          throw new AppError(
            validated.code === 'PART_ANSWER_EMPTY' ? 'EMPTY_ANSWER' : 'ANSWER_TOO_LONG',
            'answer',
            { length: validated.length },
          );
        }
        throw new AppError(validated.code, `answers[${validated.index}]`, {
          label: validated.label,
          length: validated.length,
        });
      }
    }

    const activity = this.machine.activity;
    if (!activity) throw new AppError('NO_ACTIVITY');
    if (activity.phase === 'ENDED') throw new AppError('ACTIVITY_ENDED');
    // 剛結束的題目：以伺服器狀態為準拒絕（002 US3、FR-011）
    if (activity.phase === 'CLOSED' && activity.currentQuestionId === questionId) {
      throw new AppError('QUESTION_CLOSED');
    }
    if (
      activity.phase !== 'ANSWERING' ||
      activity.currentQuestionId !== questionId ||
      this.questionId !== questionId ||
      !validated?.ok
    ) {
      throw new AppError('QUESTION_NOT_OPEN', 'questionId');
    }

    if (this.byTeam.has(student.teamId)) throw new AppError('ALREADY_SUBMITTED');

    const submission: Submission = {
      activityId: activity.id,
      questionId,
      teamId: student.teamId,
      studentId: student.studentId,
      answer: joinPartAnswers(validated.value),
      answers: validated.value,
      round: this.round,
      voided: false,
      receivedAt: Date.now(),
      rank: this.byTeam.size + 1,
    };
    this.byTeam.set(student.teamId, submission);
    return submission;
  }

  forTeam(teamId: string): Submission | undefined {
    return this.byTeam.get(teamId);
  }

  /** 目前輪次的所有送出，依 rank 排序 */
  all(): Submission[] {
    return [...this.byTeam.values()].sort((a, b) => a.rank - b.rank);
  }
}
