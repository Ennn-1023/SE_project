import type { Repository } from '../data/repositories';
import type { ClosedReason, QuestionResult, Submission } from './buzzerTypes';

/** 題目結束時產生結果（002 FR-019；004 data-model.md §1.7、§1.8、research.md R5） */
export class ResultService {
  constructor(private readonly repo: Repository) {}

  /**
   * 以單一交易作廢同題較早輪次，並寫入本輪所有送出與一筆結果；
   * rank 1 為搶答成功，無人送出時欄位為 null、answers 為空陣列。
   */
  finalize(
    activityId: string,
    questionId: string,
    round: number,
    submissions: Submission[],
    reason: ClosedReason,
    now: number = Date.now(),
  ): QuestionResult {
    const winner = submissions.find((s) => s.rank === 1) ?? null;
    const result: QuestionResult = {
      activityId,
      questionId,
      answer: winner?.answer ?? null,
      winnerTeam: winner?.teamId ?? null,
      submittedAt: winner?.receivedAt ?? null,
      round,
      voided: false,
      closedReason: reason,
      closedAt: now,
      answers: winner?.answers ?? [],
    };
    this.repo.saveQuestionOutcome(
      [...submissions].sort((a, b) => a.rank - b.rank),
      result,
    );
    return result;
  }
}
