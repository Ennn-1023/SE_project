/**
 * 005 答案寫回 Google 試算表＋活動結果匯出 CSV 的共用型別與規則
 * （specs/005-sheets-writeback-csv-export/data-model.md §3、§5；diagrams/005-class.puml）。
 * 前端（即時檢查）與後端（伺服器端最終驗證）共用同一份規則。
 */

/** 覆蓋選項（FR-011）：全部覆蓋／略過已有內容的格子 */
export type OverwriteMode = 'OVERWRITE_ALL' | 'SKIP_NON_EMPTY';
export const OVERWRITE_MODES: readonly OverwriteMode[] = ['OVERWRITE_ALL', 'SKIP_NON_EMPTY'];

/** 寫回項目狀態（data-model.md §3.3） */
export type WritebackItemStatus =
  'EMPTY' | 'OVERWRITE' | 'SAME_CONTENT' | 'ANNOTATION_MISSING' | 'ANNOTATION_DUPLICATED';

/** 不寫入的題目原因（FR-008） */
export type SkipReason = 'NO_WINNER' | 'NOT_OPENED' | 'ANSWERING';

/** 寫回結果中略過格子的原因 */
export type SkippedCellReason = 'NON_EMPTY' | 'ANNOTATION_MISSING' | 'ANNOTATION_DUPLICATED';

// ---------- API DTO（contracts/openapi.yaml） ----------

export interface WritebackTargetView {
  spreadsheetTitle: string;
  /** 目前分頁名稱 */
  sheetTitle: string;
  url: string;
}

export interface WritebackItemView {
  /** `${questionKey}:${partIndex}`，作為 fallbackKeys 的值 */
  key: string;
  questionNumber: string;
  partLabel: string | null;
  /** 依標註找到的目前位置；找不到或重複時為 null */
  cell: string | null;
  /** 匯入當下記錄的位置 */
  fallbackCell: string | null;
  hidden: boolean;
  winnerTeamName: string;
  answer: string;
  /** 目標格（ANNOTATION_MISSING 時為後備格）目前顯示值 */
  currentContent: string;
  status: WritebackItemStatus;
}

export interface SkippedQuestionView {
  questionNumber: string;
  reason: SkipReason;
}

export interface WritebackSummaryView {
  emptyCount: number;
  overwriteCount: number;
  sameCount: number;
  /** ANNOTATION_MISSING＋ANNOTATION_DUPLICATED */
  unresolvedCount: number;
  skippedQuestionCount: number;
}

export interface WritebackPreviewView {
  previewId: string;
  expiresAt: string;
  target: WritebackTargetView;
  items: WritebackItemView[];
  skipped: SkippedQuestionView[];
  summary: WritebackSummaryView;
}

export interface WritebackOutcomeView {
  writtenCells: number;
  writtenQuestions: number;
  overwrittenCells: number;
  skippedCells: number;
  skippedReasons: { reason: SkippedCellReason; count: number }[];
  spreadsheetUrl: string;
}

export interface WritebackConfirmBody {
  previewId: string;
  mode?: OverwriteMode;
  fallbackKeys?: string[];
}

/** CSV 標題列（data-model.md §4；前後端測試共用） */
export const CSV_HEADERS = [
  '題號',
  '小題',
  '題目狀態',
  '組別',
  '搶答順位',
  '是否搶答成功',
  '送出時間（秒）',
  '答案',
] as const;

// ---------- WritebackRules（data-model.md §5） ----------

export const PREVIEW_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;
export const FALLBACK_KEY_PATTERN = /^[A-Za-z0-9_-]{4,12}:[0-9]$/;
export const MAX_FALLBACK_KEYS = 2000;

export type RuleCheck<T> = { ok: true; value: T } | { ok: false; message: string; hint: string };

/** mode 為選填；有值時必須是允許值之一 */
export function validateOverwriteMode(input: unknown): RuleCheck<OverwriteMode | undefined> {
  if (input === undefined) return { ok: true, value: undefined };
  if (typeof input === 'string' && (OVERWRITE_MODES as readonly string[]).includes(input)) {
    return { ok: true, value: input as OverwriteMode };
  }
  return {
    ok: false,
    message: 'mode 只能是 OVERWRITE_ALL（全部覆蓋）或 SKIP_NON_EMPTY（略過已有內容的格子）',
    hint: '請重新選擇覆蓋選項',
  };
}

/** fallbackKeys 為選填陣列：格式正確、不重複，且只能是本預覽中「找不到標註」的項目 */
export function validateFallbackKeys(
  input: unknown,
  allowedKeys: ReadonlySet<string>,
): RuleCheck<string[]> {
  if (input === undefined) return { ok: true, value: [] };
  const fail = (message: string): RuleCheck<string[]> => ({
    ok: false,
    message,
    hint: '請重新預覽後再勾選「寫入匯入時的位置」',
  });
  if (!Array.isArray(input)) return fail('fallbackKeys 必須是陣列');
  if (input.length > MAX_FALLBACK_KEYS) {
    return fail(`fallbackKeys 最多 ${MAX_FALLBACK_KEYS} 個，目前 ${input.length} 個`);
  }
  const seen = new Set<string>();
  for (const key of input) {
    if (typeof key !== 'string' || !FALLBACK_KEY_PATTERN.test(key)) {
      return fail('fallbackKeys 含格式不正確的項目');
    }
    if (seen.has(key)) return fail(`fallbackKeys 重複勾選了 ${key}`);
    if (!allowedKeys.has(key)) return fail(`${key} 不是本預覽中「找不到作答格標註」的項目`);
    seen.add(key);
  }
  return { ok: true, value: [...seen] };
}

export const WritebackRules = { validateOverwriteMode, validateFallbackKeys };
