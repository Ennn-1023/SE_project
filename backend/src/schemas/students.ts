import { z } from 'zod';
import { fieldError, msg } from '../middleware/validate.js';

export const STUDENT_ID_HINT = '學號須為 4–20 個英文字母或數字，不可含空白或符號';
const NAME_HINT = '姓名須為 1–50 個字元';

/** 學號（data-model.md `users.account`）：去除前後空白後 4–20 英數字，轉大寫。 */
export const studentIdSchema = z
  .string(fieldError(msg('請輸入學號', STUDENT_ID_HINT), msg('學號格式不正確', STUDENT_ID_HINT)))
  .trim()
  .regex(/^[A-Za-z0-9]{4,20}$/, msg('學號格式不正確', STUDENT_ID_HINT))
  .transform((s) => s.toUpperCase());

/** POST /api/students（data-model.md `users.account`、`users.display_name`）。 */
export const createStudentBody = z.object({
  studentId: studentIdSchema,
  name: z
    .string(fieldError(msg('請輸入姓名', NAME_HINT), msg('姓名格式不正確', NAME_HINT)))
    .trim()
    .min(1, msg('請輸入姓名', NAME_HINT))
    .max(50, msg('姓名過長', NAME_HINT)),
});

export const studentIdParams = z.object({ studentId: studentIdSchema });
