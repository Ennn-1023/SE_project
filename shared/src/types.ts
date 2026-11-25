/** 活動階段（data-model.md Activity.phase） */
export type ActivityPhase = 'WAITING' | 'ANSWERING' | 'CLOSED' | 'ENDED';

export const ACTIVITY_PHASES: readonly ActivityPhase[] = ['WAITING', 'ANSWERING', 'CLOSED', 'ENDED'];

/** 學生視角的階段：另有 NO_ACTIVITY（從未開始過任何活動，004 FR-030） */
export type StudentPhase = ActivityPhase | 'NO_ACTIVITY';

export type MyTeamOutcome = 'WIN' | 'LOSE' | 'NOT_SUBMITTED';

/** 一個小題的答案（004 data-model.md §3）；單題的 partLabel 為 null */
export interface PartAnswer {
  partIndex: number;
  partLabel: string | null;
  answer: string;
}

export interface QuestionPartView {
  partIndex: number;
  partLabel: string | null;
  text: string;
}

export interface QuestionView {
  questionId: string;
  number: number;
  /** 單題＝題目文字；題組＝共同題幹（無則第 1 小題文字） */
  text: string;
  /** 004：題號（老師設定，例如「Q2」） */
  label?: string;
  kind?: 'SINGLE' | 'GROUP';
  stem?: string | null;
  parts?: QuestionPartView[];
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
  /** 004：依小題的答案 */
  answers?: PartAnswer[];
  isWinner: boolean;
}

/** 學生視角（data-model.md StudentView）。時間欄位皆為 ISO 8601。 */
export interface StudentView {
  phase: StudentPhase;
  serverNow: string;
  myTeam: TeamRef | null;
  question?: QuestionView;
  endsAt?: string;
  myTeamSubmission?: { answer: string; answers?: PartAnswer[] } | null;
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
  /** NONE：尚未開始過任何活動（004） */
  phase: ActivityPhase | 'NONE';
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
