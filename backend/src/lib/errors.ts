/** AppError 與錯誤碼（research R9、contracts/openapi.yaml ErrorResponse）。 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  STUDENT_EXISTS: 'STUDENT_EXISTS',
  ALREADY_ASSIGNED: 'ALREADY_ASSIGNED',
  GROUPS_NOT_OPEN: 'GROUPS_NOT_OPEN',
  GROUP_NOT_EMPTY: 'GROUP_NOT_EMPTY',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  UNSUPPORTED_MEDIA: 'UNSUPPORTED_MEDIA',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // 003 Google 試算表串接與題目匯入（plan.md「錯誤情境與訊息」）
  GOOGLE_NOT_CONFIGURED: 'GOOGLE_NOT_CONFIGURED',
  GOOGLE_NOT_CONNECTED: 'GOOGLE_NOT_CONNECTED',
  GOOGLE_AUTH_EXPIRED: 'GOOGLE_AUTH_EXPIRED',
  GOOGLE_RATE_LIMITED: 'GOOGLE_RATE_LIMITED',
  GOOGLE_UNAVAILABLE: 'GOOGLE_UNAVAILABLE',
  SHEET_LINK_INVALID: 'SHEET_LINK_INVALID',
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  SHEET_FORBIDDEN: 'SHEET_FORBIDDEN',
  SHEET_NO_EDIT_PERMISSION: 'SHEET_NO_EDIT_PERMISSION',
  SHEET_TAB_NOT_FOUND: 'SHEET_TAB_NOT_FOUND',
  SHEET_EMPTY: 'SHEET_EMPTY',
  SHEET_TOO_LARGE: 'SHEET_TOO_LARGE',
  SHEET_CHANGED: 'SHEET_CHANGED',
  ANNOTATION_INVALID: 'ANNOTATION_INVALID',
  DRAFT_EXPIRED: 'DRAFT_EXPIRED',
  DRAFT_REVISION_CONFLICT: 'DRAFT_REVISION_CONFLICT',
  SHEET_NOT_NATIVE: 'SHEET_NOT_NATIVE',
  // 005 答案寫回與結果匯出（specs/005-sheets-writeback-csv-export/research.md R12）
  NO_ACTIVITY_RESULTS: 'NO_ACTIVITY_RESULTS',
  WRITEBACK_NO_SOURCE: 'WRITEBACK_NO_SOURCE',
  WRITEBACK_NOTHING_TO_WRITE: 'WRITEBACK_NOTHING_TO_WRITE',
  WRITEBACK_NOT_THIS_SHEET: 'WRITEBACK_NOT_THIS_SHEET',
  WRITEBACK_PREVIEW_EXPIRED: 'WRITEBACK_PREVIEW_EXPIRED',
  WRITEBACK_STALE: 'WRITEBACK_STALE',
  WRITEBACK_IN_PROGRESS: 'WRITEBACK_IN_PROGRESS',
  WRITEBACK_OVERWRITE_REQUIRED: 'WRITEBACK_OVERWRITE_REQUIRED',
  SHEET_PROTECTED_RANGE: 'SHEET_PROTECTED_RANGE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CURRENT_PASSWORD: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STUDENT_EXISTS: 409,
  ALREADY_ASSIGNED: 409,
  GROUPS_NOT_OPEN: 409,
  GROUP_NOT_EMPTY: 409,
  ACCOUNT_LOCKED: 423,
  UNSUPPORTED_MEDIA: 415,
  INTERNAL_ERROR: 500,
  GOOGLE_NOT_CONFIGURED: 503,
  GOOGLE_NOT_CONNECTED: 409,
  GOOGLE_AUTH_EXPIRED: 409,
  GOOGLE_RATE_LIMITED: 503,
  GOOGLE_UNAVAILABLE: 503,
  SHEET_LINK_INVALID: 400,
  SHEET_NOT_FOUND: 404,
  SHEET_FORBIDDEN: 403,
  SHEET_NO_EDIT_PERMISSION: 403,
  SHEET_TAB_NOT_FOUND: 404,
  SHEET_EMPTY: 422,
  SHEET_TOO_LARGE: 422,
  SHEET_CHANGED: 409,
  ANNOTATION_INVALID: 422,
  DRAFT_EXPIRED: 410,
  DRAFT_REVISION_CONFLICT: 409,
  SHEET_NOT_NATIVE: 422,
  NO_ACTIVITY_RESULTS: 404,
  WRITEBACK_NO_SOURCE: 409,
  WRITEBACK_NOTHING_TO_WRITE: 409,
  WRITEBACK_NOT_THIS_SHEET: 409,
  WRITEBACK_PREVIEW_EXPIRED: 410,
  WRITEBACK_STALE: 409,
  WRITEBACK_IN_PROGRESS: 409,
  WRITEBACK_OVERWRITE_REQUIRED: 400,
  SHEET_PROTECTED_RANGE: 403,
};

/** 003 錯誤碼的固定訊息與修正提示（plan.md「錯誤情境與訊息」表）。 */
export const ERROR_TEXT: Partial<Record<ErrorCode, { message: string; hint: string }>> = {
  GOOGLE_NOT_CONFIGURED: { message: '系統尚未設定 Google 試算表串接', hint: '請聯絡系統管理者' },
  GOOGLE_NOT_CONNECTED: {
    message: '請先連結 Google 帳號，才能讀取學習單',
    hint: '請按「連結 Google 帳號」',
  },
  GOOGLE_AUTH_EXPIRED: { message: 'Google 帳號授權已失效', hint: '請重新連結 Google 帳號' },
  GOOGLE_RATE_LIMITED: {
    message: '暫時無法連線到 Google 試算表',
    hint: 'Google 使用量暫時超過上限，請稍後再試',
  },
  GOOGLE_UNAVAILABLE: { message: '暫時無法連線到 Google 試算表', hint: '請稍後再試' },
  SHEET_LINK_INVALID: {
    message: '請貼上 Google 試算表連結',
    hint: '例如 https://docs.google.com/spreadsheets/d/…',
  },
  SHEET_NOT_FOUND: { message: '找不到這份試算表', hint: '請確認連結是否正確' },
  SHEET_FORBIDDEN: {
    message: '你連結的 Google 帳號沒有這份試算表的檢視權限',
    hint: '請確認連結，或請擁有者將試算表分享給你',
  },
  SHEET_NO_EDIT_PERMISSION: {
    message: '你連結的 Google 帳號沒有這份試算表的編輯權限，無法保存標註',
    hint: '請擁有者將你設為「編輯者」後再確認匯入',
  },
  SHEET_TAB_NOT_FOUND: { message: '找不到指定的分頁', hint: '請從列出的分頁中選擇' },
  SHEET_EMPTY: { message: '這個分頁是空的', hint: '請選擇其他分頁' },
  SHEET_TOO_LARGE: {
    message: '這個分頁的使用範圍超過上限 500 列 × 52 欄',
    hint: '請把學習單放在範圍較小的分頁',
  },
  SHEET_CHANGED: { message: '學習單在標註期間被修改', hint: '請重新讀取並確認標註' },
  ANNOTATION_INVALID: { message: '標註尚未完成或有錯誤', hint: '請依清單逐項修正後再預覽' },
  DRAFT_EXPIRED: {
    message: '標註進度已超過 30 分鐘未儲存而失效',
    hint: '請重新讀取學習單',
  },
  SHEET_NOT_NATIVE: {
    message: '這個檔案不是 Google 試算表格式（可能是上傳的 Excel 檔）',
    hint: '請在 Google 試算表中選「檔案 → 儲存為 Google 試算表」，再貼上新檔案的連結',
  },
  DRAFT_REVISION_CONFLICT: {
    message: '此學習單已在其他視窗修改',
    hint: '請重新載入以取得最新的標註',
  },
  // 005（research.md R12）
  NO_ACTIVITY_RESULTS: {
    message: '尚無搶答活動結果可寫回或匯出',
    hint: '請先開始活動並完成至少一題',
  },
  WRITEBACK_NO_SOURCE: {
    message: '本場活動沒有記錄來源試算表，無法寫回',
    hint: '寫回功能上線前開始的活動，或不是從 Google 試算表匯入題目的活動，都無法寫回；可改用「匯出結果 CSV」保存結果',
  },
  WRITEBACK_NOTHING_TO_WRITE: {
    message: '本場活動沒有搶答成功的答案可寫回',
    hint: '可先匯出 CSV 保存結果',
  },
  WRITEBACK_NOT_THIS_SHEET: {
    message: '這份學習單上找不到本場活動的作答格標註',
    hint: '請確認是否為本場活動使用的學習單',
  },
  WRITEBACK_PREVIEW_EXPIRED: { message: '預覽已失效', hint: '請重新預覽' },
  WRITEBACK_STALE: { message: '學習單在預覽後有變動', hint: '請重新預覽' },
  WRITEBACK_IN_PROGRESS: { message: '寫回進行中，請稍候', hint: '完成後會顯示寫回結果' },
  WRITEBACK_OVERWRITE_REQUIRED: {
    message: '有作答格已有內容，請選擇「全部覆蓋」或「略過已有內容的格子」',
    hint: '選擇覆蓋選項後再按「確認寫回」',
  },
  SHEET_PROTECTED_RANGE: {
    message: '作答格位於受保護範圍，無法寫入',
    hint: '請試算表擁有者解除保護，或將你加入可編輯名單',
  },
};

export interface AppErrorOptions {
  field?: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly field?: string;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.field = options.field;
    this.hint = options.hint;
    this.details = options.details;
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.field !== undefined ? { field: this.field } : {}),
        ...(this.hint !== undefined ? { hint: this.hint } : {}),
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

export const INTERNAL_ERROR_MESSAGE = '系統發生錯誤，請稍後再試';

/** 以 ERROR_TEXT 的固定訊息建立 AppError；可覆寫 message 或加上 details。 */
export function appError(
  code: ErrorCode,
  options: AppErrorOptions & { message?: string } = {},
): AppError {
  const text = ERROR_TEXT[code];
  const { message, ...rest } = options;
  return new AppError(code, message ?? text?.message ?? code, {
    hint: text?.hint,
    ...rest,
  });
}
