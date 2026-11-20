import { z } from "zod";
import type { FieldError } from "../errors.js";

/** 欄位提示：message 說明原因，hint 說明如何修正（憲章原則 II）。 */
export function issue(message: string, hint?: string): string {
  return hint ? `${message}|${hint}` : message;
}

/** 將 zod 錯誤轉成 FieldError 陣列，列出所有出錯欄位（每個欄位只取第一個錯誤）。 */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const result: FieldError[] = [];
  for (const item of error.issues) {
    const field = item.path.length > 0 ? item.path.map(String).join(".") : "body";
    if (seen.has(field)) continue;
    seen.add(field);
    const [message = "格式錯誤", hint] = item.message.split("|");
    result.push(hint ? { field, message, hint } : { field, message });
  }
  return result;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldError[] };

export function parseWith<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: toFieldErrors(result.error) };
}

/** 必填字串：缺少或非字串都視為「未填」。 */
export function requiredString(label: string) {
  return z.string({ error: issue(`請輸入${label}`, `${label}為必填欄位`) });
}

/** 9 位半形數字學號（data-model.md User.username，學生）。 */
export const STUDENT_ID_PATTERN = /^[0-9]{9}$/;
export const STUDENT_ID_MESSAGE = issue("學號須為 9 位數字", "請輸入 9 位半形數字，例如 411000001");

export const studentIdSchema = requiredString("學號")
  .trim()
  .min(1, issue("請輸入學號", "學號為必填欄位"))
  .regex(STUDENT_ID_PATTERN, STUDENT_ID_MESSAGE);

/** 密碼長度規則（data-model.md 輸入驗證規則總表）。 */
export const PASSWORD_MAX = 64;
export const NEW_PASSWORD_MIN = 8;
