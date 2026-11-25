import { z } from 'zod';
import { FALLBACK_KEY_PATTERN, MAX_FALLBACK_KEYS, PREVIEW_ID_PATTERN } from '@buzzer/shared';
import { fieldError, msg } from '../middleware/validate.js';

/**
 * 確認寫回的輸入（005 contracts/openapi.yaml ConfirmBody；data-model.md §6）。
 * - previewId：12 字元 base64url；是否存在、屬於本人、未過期由 WritebackService 判定
 * - mode：允許值與「有將覆蓋項目時必填」由 WritebackRules／WritebackService 判定（才能回 WRITEBACK_OVERWRITE_REQUIRED）
 * - fallbackKeys：格式與數量上限在此檢查；是否屬於本預覽的找不到標註項目由 WritebackRules 判定
 * - 其他欄位一律拒絕（.strict()）
 */
const PREVIEW_ID_MESSAGE = msg('預覽識別碼格式不正確', '請重新預覽後再確認寫回');

export const confirmBody = z.strictObject(
  {
    previewId: z
      .string(fieldError(msg('缺少預覽識別碼 previewId', '請先預覽再確認寫回'), PREVIEW_ID_MESSAGE))
      .regex(PREVIEW_ID_PATTERN, PREVIEW_ID_MESSAGE),
    mode: z
      .enum(['OVERWRITE_ALL', 'SKIP_NON_EMPTY'], {
        error: msg(
          'mode 只能是 OVERWRITE_ALL（全部覆蓋）或 SKIP_NON_EMPTY（略過已有內容的格子）',
          '請重新選擇覆蓋選項',
        ),
      })
      .optional(),
    fallbackKeys: z
      .array(
        z
          .string()
          .regex(
            FALLBACK_KEY_PATTERN,
            msg('fallbackKeys 含格式不正確的項目', '請重新預覽後再勾選'),
          ),
        { error: msg('fallbackKeys 必須是陣列', '請重新預覽後再勾選') },
      )
      .max(
        MAX_FALLBACK_KEYS,
        msg(`fallbackKeys 最多 ${MAX_FALLBACK_KEYS} 個`, '請重新預覽後再勾選'),
      )
      .optional(),
  },
  { error: msg('確認寫回只接受 previewId、mode、fallbackKeys 欄位', '請移除其他欄位後再送出') },
);
