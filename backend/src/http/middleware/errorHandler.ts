import { describeError, type ErrorBody, type ErrorCode, type ErrorParams } from '@buzzer/shared';

/**
 * 搶答錯誤碼 → 統一錯誤格式 { error: { code, field, message, hint } }（憲章原則 II）。
 * HTTP 的錯誤處理統一由 middleware/errorHandler.ts 負責；Socket.IO 握手錯誤也使用此格式。
 */
export function toErrorBody(
  code: ErrorCode,
  field: string | null = null,
  params: ErrorParams = {},
): { status: number; body: ErrorBody } {
  const d = describeError(code, params);
  return { status: d.status, body: { error: { code, field, message: d.message, hint: d.hint } } };
}
