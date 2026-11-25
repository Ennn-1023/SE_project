import type {
  ActivityPhase,
  ActivityQuestionStatus,
  ClosedReason,
  PartAnswer,
  QuestionKind,
} from '@buzzer/shared';

export type { ClosedReason, PartAnswer } from '@buzzer/shared';

/** 活動（002 data-model；004 data-model.md §1.1）。時間皆為 epoch ms。 */
export interface Activity {
  id: string;
  phase: ActivityPhase;
  currentQuestionId: string | null;
  /** 目前題目本輪開放時間，只有 ANSWERING 時有值 */
  openedAt: number | null;
  /** 作答結束時間點，只有 ANSWERING 時有值；開放後不可修改（FR-009a） */
  endsAt: number | null;
  startedAt: number | null;
  startedBy: number | null;
  endedAt: number | null;
  sourceTitle: string | null;
  /** 重啟取消作答等提示（research.md R5） */
  notice: string | null;
  /**
   * 寫回目標（005 data-model.md §1.1 activities.*）：開始活動時的來源試算表與分頁。
   * 002 mock 活動與 v5 之前的活動為 null；建立後不再變更。
   */
  source?: ActivitySource | null;
}

/** 005 data-model.md §1.1 */
export interface ActivitySource {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetId: number;
  sheetTitle: string;
  sourceUrl: string;
}

/** 002 的題目（學生視角使用） */
export interface Question {
  questionId: string;
  activityId: string;
  number: number;
  text: string;
}

/** 活動題目（004 data-model.md §1.2）：開始活動時自題目集複製 */
export interface ActivityQuestion extends Question {
  questionId: string;
  activityId: string;
  label: string;
  /** 題目順序，等於 number */
  position: number;
  questionKey: string | null;
  kind: QuestionKind;
  stem: string | null;
  status: ActivityQuestionStatus;
  /** 0 = 未開放過 */
  currentRound: number;
  seconds: number | null;
  openedAt: number | null;
  closedAt: number | null;
  closedReason: ClosedReason | null;
}

/** data-model.md §1.3 */
export interface QuestionPart {
  partIndex: number;
  partLabel: string | null;
  questionText: string;
}

/** data-model.md §1.4：某題某輪開放當下有成員的組別 */
export interface ParticipatingTeam {
  activityId: string;
  questionId: string;
  round: number;
  teamId: string;
  teamName: string;
  memberCount: number;
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

/** 送出紀錄（data-model.md §1.5、§1.6） */
export interface Submission {
  activityId: string;
  questionId: string;
  teamId: string;
  studentId: string;
  /** 顯示用合併文字（research.md R6） */
  answer: string;
  answers: PartAnswer[];
  round: number;
  voided: boolean;
  /** 伺服器 epoch ms */
  receivedAt: number;
  rank: number;
}

/** 題目結果（data-model.md §1.7、§1.8） */
export interface QuestionResult {
  activityId: string;
  questionId: string;
  answer: string | null;
  winnerTeam: string | null;
  submittedAt: number | null;
  round: number;
  voided: boolean;
  closedReason: ClosedReason;
  closedAt: number;
  /** 搶答成功組各小題答案；無人送出時為空陣列 */
  answers: PartAnswer[];
}

/** data-model.md §1.9 activity_events.type */
export type ActivityEventType =
  | 'STARTED'
  | 'QUESTION_OPENED'
  | 'QUESTION_REOPENED'
  | 'QUESTION_CLOSED'
  | 'BACK_TO_WAITING'
  | 'ENDED'
  | 'RESTART_CANCELLED';

/** data-model.md §1.9；detail 不得含答案內容（FR-029） */
export interface ActivityEvent {
  activityId: string;
  at: Date;
  /** 老師 users.id；系統事件為 null */
  actorId: number | null;
  type: ActivityEventType;
  questionId: string | null;
  detail: string | null;
}
