import { z } from 'zod';
import { fieldError, msg } from '../middleware/validate.js';

const LINK_MESSAGE = msg(
  '請貼上 Google 試算表連結',
  '例如 https://docs.google.com/spreadsheets/d/…',
);

/** POST /question-import/drafts（contracts/openapi.yaml）。連結格式由 parseSheetLink 判斷。 */
export const createDraftBody = z
  .object({
    link: z
      .string(fieldError(LINK_MESSAGE))
      .trim()
      .min(1, LINK_MESSAGE)
      .max(2000, msg('連結長度不可超過 2,000 字元', '請貼上試算表網址列的連結')),
    sheetId: z
      .number(fieldError('分頁編號須為數字', '分頁編號須為數字'))
      .int(msg('分頁編號格式不正確', '請從分頁清單中選擇'))
      .min(0, msg('分頁編號格式不正確', '請從分頁清單中選擇'))
      .optional(),
  })
  .strict();

export const draftIdParams = z.object({
  draftId: z.uuid(msg('找不到這份標註草稿', '請重新讀取學習單')),
});

const cellRef = z
  .string()
  .regex(/^[A-Z]{1,2}[1-9][0-9]{0,2}$/, msg('格子位置格式不正確', '請重新點選格子'))
  .nullable();

/** PUT /question-import/drafts/:draftId/annotations（contracts/openapi.yaml `AnnotationDocument`）。 */
export const saveAnnotationsBody = z
  .object({
    revision: z.number(fieldError('缺少 revision', 'revision 須為數字')).int().min(0),
    annotations: z
      .object({
        questions: z
          .array(
            z
              .object({
                key: z
                  .string()
                  .regex(/^[A-Za-z0-9]{4,12}$/, msg('題目識別碼格式不正確', '請重新載入頁面')),
                // 去頭尾空白後 1–20 字元由 validateAnnotations 判定（LABEL_INVALID）
                label: z.string().max(40, msg('題號過長', '題號須為 1–20 個字')),
                labelManual: z.boolean(),
                kind: z.enum(['SINGLE', 'GROUP'], { error: '題目類型須為單題或題組' }),
                stemCell: cellRef,
                parts: z
                  .array(z.object({ questionCell: cellRef, answerCell: cellRef }).strict())
                  .max(10, msg('每題最多 10 個小題', '請刪除多餘的小題')),
              })
              .strict(),
          )
          .max(200, msg('題目數不可超過 200 題', '請刪除多餘的題目')),
      })
      .strict(),
  })
  .strict();
