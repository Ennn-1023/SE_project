import type { ActivityQuestionStatus, QuestionKind } from '@buzzer/shared';
import type { Repository } from '../data/repositories.js';
import { groupNumberOf, teamNameOf } from '../data/repositories.js';
import type { Activity } from '../domain/buzzerTypes.js';

/** 一題的有效結果（data-model.md §2 QuestionOutcome）。不含送出者（Clarifications Q4）。 */
export interface QuestionOutcome {
  questionId: string;
  questionKey: string | null;
  position: number;
  label: string;
  kind: QuestionKind;
  status: ActivityQuestionStatus;
  /** 有效結果所屬輪次（CLOSED）；其他狀態為目前輪次 */
  round: number;
  /** 有效輪次的開放時間（epoch ms）；無法得知時為 null */
  openedAt: number | null;
  parts: { partIndex: number; partLabel: string | null; fallbackCell: string | null }[];
  /** 有效輪次的參與組別（CLOSED 才有），依組號排序 */
  teams: { teamId: string; teamName: string; groupNumber: number }[];
  /** 有效輪次的送出，依 rank 排序（CLOSED 才有） */
  submissions: {
    teamId: string;
    rank: number;
    receivedAt: number;
    answers: { partIndex: number; answer: string }[];
  }[];
  /** 有效結果的搶答成功組別；無人送出或非 CLOSED 時為 null */
  winner: {
    teamId: string;
    teamName: string;
    answers: { partIndex: number; answer: string }[];
  } | null;
}

/**
 * ActivityResultReader（005 組件圖、research R9）：寫回與 CSV 共用的唯讀結果讀取，
 * 讓「只含已結束題目的目前有效輪次」（FR-002、FR-019）只實作一次。
 */
export class ActivityResultReader {
  constructor(private readonly repo: Repository) {}

  /** 最近一場活動（FR-001）；從未開始過活動時為 null */
  latestActivity(): Activity | null {
    return this.repo.getLatestStartedActivity();
  }

  validResults(activityId: string): QuestionOutcome[] {
    const { repo } = this;
    return repo.listQuestions(activityId).map((q): QuestionOutcome => {
      const cells = repo.getAnswerCells(q.questionId);
      const parts = repo.getQuestionParts(q.questionId).map((p) => ({
        partIndex: p.partIndex,
        partLabel: p.partLabel,
        fallbackCell: cells.get(p.partIndex) ?? null,
      }));
      const base = {
        questionId: q.questionId,
        questionKey: q.questionKey,
        position: q.position,
        label: q.label,
        kind: q.kind,
        status: q.status,
        parts,
      };
      const result = q.status === 'CLOSED' ? repo.getResult(activityId, q.questionId) : null;
      // 作答中與未開放（含重新開放後作答中）不帶任何輪次的送出（FR-002）
      if (!result) {
        return {
          ...base,
          round: q.currentRound,
          openedAt: null,
          teams: [],
          submissions: [],
          winner: null,
        };
      }
      const teams = repo
        .listParticipants(activityId, q.questionId, result.round)
        .map((t) => ({
          teamId: t.teamId,
          teamName: t.teamName,
          groupNumber: groupNumberOf(t.teamId) ?? 0,
        }));
      const submissions = repo
        .listSubmissions(activityId, q.questionId)
        .filter((s) => s.round === result.round)
        .sort((a, b) => a.rank - b.rank)
        .map((s) => ({
          teamId: s.teamId,
          rank: s.rank,
          receivedAt: s.receivedAt,
          answers: s.answers.map((a) => ({ partIndex: a.partIndex, answer: a.answer })),
        }));
      const winner = result.winnerTeam
        ? {
            teamId: result.winnerTeam,
            teamName: teamNameOf(groupNumberOf(result.winnerTeam) ?? 0),
            answers: result.answers.map((a) => ({ partIndex: a.partIndex, answer: a.answer })),
          }
        : null;
      return {
        ...base,
        round: result.round,
        openedAt: result.round === q.currentRound ? q.openedAt : null,
        teams,
        submissions,
        winner,
      };
    });
  }
}
