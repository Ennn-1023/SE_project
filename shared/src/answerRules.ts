/** 答案規則（data-model.md Submission.answer；research.md R8） */
export const MAX_ANSWER_LENGTH = 500;

/** 以 Unicode code point 計算字數，emoji 等字元算 1 字 */
export function countChars(s: string): number {
  return [...s].length;
}

export type AnswerCheck =
  | { ok: true; value: string; length: number }
  | { ok: false; code: 'EMPTY_ANSWER' | 'ANSWER_TOO_LONG'; length: number };

/** 去除前後空白後驗證；成功時回傳要儲存的值 */
export function validateAnswer(raw: string): AnswerCheck {
  const value = raw.trim();
  const length = countChars(value);
  if (length === 0) return { ok: false, code: 'EMPTY_ANSWER', length };
  if (length > MAX_ANSWER_LENGTH) return { ok: false, code: 'ANSWER_TOO_LONG', length };
  return { ok: true, value, length };
}
