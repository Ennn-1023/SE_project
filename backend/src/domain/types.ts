import type { ActivityPhase } from '@buzzer/shared';

/** data-model.md Activity */
export interface Activity {
  id: string;
  phase: ActivityPhase;
  currentQuestionId: string | null;
  /** epoch ms，只有 ANSWERING 時有值 */
  endsAt: number | null;
}

/** data-model.md Question */
export interface Question {
  questionId: string;
  activityId: string;
  number: number;
  text: string;
}

/** data-model.md Team */
export interface Team {
  teamId: string;
  activityId: string;
  name: string;
}

/** data-model.md Student */
export interface Student {
  studentId: string;
  name: string;
  teamId: string | null;
}

/** data-model.md Submission */
export interface Submission {
  activityId: string;
  questionId: string;
  teamId: string;
  studentId: string;
  answer: string;
  /** 伺服器 epoch ms */
  receivedAt: number;
  rank: number;
}

export type ClosedReason = 'TIME_UP' | 'MANUAL' | 'ACTIVITY_ENDED';

/** data-model.md QuestionResult */
export interface QuestionResult {
  activityId: string;
  questionId: string;
  answer: string | null;
  winnerTeam: string | null;
  submittedAt: number | null;
  closedReason: ClosedReason;
  closedAt: number;
}
