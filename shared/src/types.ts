/** 活動階段（data-model.md Activity.phase） */
export type ActivityPhase = 'WAITING' | 'ANSWERING' | 'CLOSED' | 'ENDED';

export const ACTIVITY_PHASES: readonly ActivityPhase[] = ['WAITING', 'ANSWERING', 'CLOSED', 'ENDED'];

export type MyTeamOutcome = 'WIN' | 'LOSE' | 'NOT_SUBMITTED';

export interface QuestionView {
  questionId: string;
  number: number;
  text: string;
}

export interface TeamRef {
  teamId: string;
  name: string;
}

/** 結果揭曉時的一列；依釐清 Q4，不含送出時間與送出者 */
export interface TeamAnswer {
  rank: number;
  teamName: string;
  answer: string;
  isWinner: boolean;
}

/** 學生視角（data-model.md StudentView）。時間欄位皆為 ISO 8601。 */
export interface StudentView {
  phase: ActivityPhase;
  serverNow: string;
  myTeam: TeamRef | null;
  question?: QuestionView;
  endsAt?: string;
  myTeamSubmission?: { answer: string } | null;
  results?: TeamAnswer[];
  myTeamOutcome?: MyTeamOutcome;
}

export interface ErrorBody {
  error: {
    code: string;
    field: string | null;
    message: string;
    hint: string;
  };
}

export interface TeacherStatus {
  phase: ActivityPhase;
  currentQuestionId: string | null;
  endsAt: string | null;
}

export interface DevStudent {
  studentId: string;
  name: string;
  teamName: string | null;
}

export interface QuestionResultDto {
  question_id: string;
  answer: string | null;
  winner_team: string | null;
  submitted_at: string | null;
}
