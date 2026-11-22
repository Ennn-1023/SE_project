import type { Repository } from '../data/repositories';
import type { ClosedReason, QuestionResult, Submission } from './types';

/** 題目結束時產生結果（data-model.md QuestionResult；FR-019） */
export class ResultService {
  constructor(private readonly repo: Repository) {}

  /** 以單一交易寫入所有送出紀錄與一筆結果；rank 1 為搶答成功，無人送出時欄位為 null */
  finalize(
    activityId: string,
    questionId: string,
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
      closedReason: reason,
      closedAt: now,
    };
    this.repo.saveQuestionOutcome(
      [...submissions].sort((a, b) => a.rank - b.rank),
      result,
    );
    return result;
  }
}
