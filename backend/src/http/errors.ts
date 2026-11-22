import type { ErrorCode, ErrorParams } from '@buzzer/shared';
import type { z } from 'zod';

/** 可預期的業務錯誤；由 errorHandler 轉成 { error: { code, field, message, hint } } */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly field: string | null = null,
    public readonly params: ErrorParams = {},
  ) {
    super(code);
    this.name = 'AppError';
  }
}

const TYPE_LABEL: Record<string, string> = {
  string: '文字',
  number: '數字',
  int: '整數',
  boolean: 'true 或 false',
  object: '物件',
  array: '陣列',
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let cur: unknown = data;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}

/** 含中日韓文字才視為我們自訂的訊息；zod 預設的英文技術訊息一律不回傳給使用者 */
const isOwnMessage = (msg: string) => /[㐀-鿿]/.test(msg);

/**
 * 以 zod 驗證輸入；失敗時轉成 VALIDATION_ERROR，以中文指出哪個欄位、為何錯誤、如何修正（憲章原則 I、II）。
 * 預期輸入為 JSON 物件（body 或 query）。
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  if (!isPlainObject(data)) {
    throw new AppError('VALIDATION_ERROR', 'body', {
      message: '請求內容必須是 JSON 物件',
      hint: '請以 JSON 物件格式送出，例如 {"questionId": "Q1", "answer": "你的答案"}',
    });
  }
  const r = schema.safeParse(data);
  if (r.success) return r.data;

  const issue = r.error.issues[0];
  const path = issue?.path ?? [];
  const field = path.length > 0 ? path.map(String).join('.') : 'body';

  let reason: string;
  let hint: string;
  if (issue?.code === 'invalid_type' && valueAt(data, path) === undefined) {
    reason = '為必填';
    hint = `請提供 ${field}`;
  } else if (issue?.code === 'invalid_type') {
    const label = TYPE_LABEL[String(issue.expected)] ?? '正確的格式';
    reason = `必須是${label}`;
    hint = `請以${label}格式送出 ${field}`;
  } else {
    reason = issue && isOwnMessage(issue.message) ? issue.message : '格式不正確';
    hint = `請修正 ${field} 後再送出`;
  }

  throw new AppError('VALIDATION_ERROR', field, { field, message: `${field} ${reason}`, hint });
}
