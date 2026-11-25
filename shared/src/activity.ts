/**
 * 004 活動管理與老師監控看板的共用規則與 DTO（specs/004-activity-control-monitor/data-model.md §3、§4）。
 * 前端（即時驗證）與後端（伺服器端最終判定）共用同一份規則。
 */
import type { QuestionKind } from './annotation';
import { countChars, MAX_ANSWER_LENGTH } from './answerRules';
import type { ActivityPhase, PartAnswer } from './types';

export type { QuestionKind } from './annotation';
export type { PartAnswer, StudentPhase } from './types';

export type TeacherPhase = ActivityPhase | 'NONE';
export type ActivityQuestionStatus = 'NOT_OPENED' | 'ANSWERING' | 'CLOSED';
export type ClosedReason = 'TIME_UP' | 'MANUAL' | 'ACTIVITY_ENDED';

/** data-model.md §4 seconds */
export const DEFAULT_SECONDS = 60;
export const MIN_SECONDS = 5;
export const MAX_SECONDS = 600;

export type SecondsCheck = { ok: true; value: number } | { ok: false };

/** 作答秒數：必須是 JSON number、整數、5～600；省略（undefined）時為預設 60 秒 */
export function validateSeconds(input: unknown): SecondsCheck {
  if (input === undefined) return { ok: true, value: DEFAULT_SECONDS };
  if (typeof input !== 'number' || !Number.isInteger(input)) return { ok: false };
  if (input < MIN_SECONDS || input > MAX_SECONDS) return { ok: false };
  return { ok: true, value: input };
}

/** 小題標籤（第（2）小題）；單題為 null 時以「答案」稱呼 */
export function partName(partLabel: string | null): string {
  return partLabel ? `第${partLabel}小題` : '答案';
}

export interface PartSpec {
  partIndex: number;
  partLabel: string | null;
}

export type PartAnswersCheck =
  | { ok: true; value: PartAnswer[] }
  | { ok: false; code: 'PART_COUNT_MISMATCH'; expected: number; actual: number }
  | {
      ok: false;
      code: 'PART_ANSWER_EMPTY' | 'PART_ANSWER_TOO_LONG';
      index: number;
      label: string;
      length: number;
    };

/**
 * 依小題驗證答案（data-model.md §4 answers、answers[i]）：數量須等於小題數；
 * 每個答案去除前後空白後 1～500 字（以 code point 計）。回傳第一個不合格的小題。
 */
export function validatePartAnswers(answers: unknown, parts: readonly PartSpec[]): PartAnswersCheck {
  if (!Array.isArray(answers) || answers.length !== parts.length) {
    return {
      ok: false,
      code: 'PART_COUNT_MISMATCH',
      expected: parts.length,
      actual: Array.isArray(answers) ? answers.length : 0,
    };
  }
  const value: PartAnswer[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const raw = answers[i];
    const text = typeof raw === 'string' ? raw.trim() : '';
    const length = countChars(text);
    const label = partName(part.partLabel);
    if (length === 0) return { ok: false, code: 'PART_ANSWER_EMPTY', index: i, label, length };
    if (length > MAX_ANSWER_LENGTH) {
      return { ok: false, code: 'PART_ANSWER_TOO_LONG', index: i, label, length };
    }
    value.push({ partIndex: part.partIndex, partLabel: part.partLabel, answer: text });
  }
  return { ok: true, value };
}

/** 題組答案的合併顯示文字（research.md R6）：單題＝原答案；題組＝「（1）…\n（2）…」 */
export function joinPartAnswers(answers: readonly PartAnswer[]): string {
  if (answers.length === 1 && answers[0]!.partLabel === null) return answers[0]!.answer;
  return answers.map((a) => `${a.partLabel ?? ''}${a.answer}`).join('\n');
}

export const ActivityRules = { validateSeconds, validatePartAnswers };

// ---------- DTO（data-model.md §3） ----------

export interface QuestionListItem {
  questionId: string;
  label: string;
  position: number;
  kind: QuestionKind;
  /** 題目文字摘要（前 40 字） */
  summary: string;
  status: ActivityQuestionStatus;
  round: number;
  /** CLOSED 時的搶答成功組名；CLOSED 且 null 表示無人送出 */
  winnerTeamName: string | null;
  /** 開放前預覽完整題目（題組含共同題幹與各小題，US2-1） */
  stem: string | null;
  parts: { partIndex: number; partLabel: string | null; text: string }[];
}

export interface ActivityQuestionDetail {
  questionId: string;
  label: string;
  kind: QuestionKind;
  stem: string | null;
  parts: { partIndex: number; partLabel: string | null; text: string }[];
}

export interface MonitorTeamRow {
  teamId: string;
  teamName: string;
  submitted: boolean;
  rank: number | null;
  /** 距本輪開放的秒數，精確到 0.1 */
  elapsedSeconds: number | null;
  submitterName: string | null;
  answers: PartAnswer[] | null;
  online: number;
  members: number;
}

export interface MonitorView {
  questionId: string;
  round: number;
  submittedCount: number;
  teamCount: number;
  allSubmitted: boolean;
  /** 已送出依 rank，其後未送出依組號 */
  teams: MonitorTeamRow[];
}

export interface ResultBoardView {
  question: ActivityQuestionDetail;
  round: number;
  closedReason: ClosedReason;
  rows: MonitorTeamRow[];
  noSubmission: boolean;
}

export interface ReadinessView {
  questionCount: number;
  sourceTitle: string | null;
  teams: { teamId: string; name: string; members: number; online: number }[];
}

export interface TeacherActivityView {
  phase: TeacherPhase;
  serverNow: string;
  activity: { id: string; sourceTitle: string | null; startedAt: string | null } | null;
  /** 只在 NONE／ENDED 提供，用於開始（新）活動前的檢查 */
  readiness: ReadinessView | null;
  questions: QuestionListItem[];
  progress: { closed: number; total: number };
  current: ActivityQuestionDetail | null;
  endsAt: string | null;
  monitor: MonitorView | null;
  result: ResultBoardView | null;
  preselectedQuestionId: string | null;
  notice: string | null;
}
