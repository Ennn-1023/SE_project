import { z } from 'zod';
import { fieldError, msg } from '../middleware/validate.js';

/**
 * 老師活動控制 API 的輸入（004 contracts/openapi.yaml；規則見 data-model.md §4）。
 * - questionId：data-model.md §4 `questionId`（去除空白後 1～64 字元；是否屬於目前活動由狀態機判定）
 * - seconds：data-model.md §4 `seconds`（型別與範圍由 ActivityRules.validateSeconds 判定，才能回傳 INVALID_SECONDS）
 * - confirm：data-model.md §4 `confirm`（reopen 必須為 true，由 ActivityService 判定並回傳 REOPEN_NOT_CONFIRMED）
 */
const QUESTION_ID_MESSAGE = msg('請選擇要開放的題目', '請從題目清單中選擇一題');

const questionId = z
  .string(fieldError(QUESTION_ID_MESSAGE))
  .trim()
  .min(1, QUESTION_ID_MESSAGE)
  .max(64, msg('題目識別碼最多 64 字元', '請從題目清單中選擇一題'));

export const openBody = z
  .object({
    questionId,
    seconds: z.unknown().optional(),
  })
  .strict();

export const reopenBody = z
  .object({
    questionId,
    seconds: z.unknown().optional(),
    confirm: z.unknown().optional(),
  })
  .strict();

export const questionIdParams = z.object({ questionId });
