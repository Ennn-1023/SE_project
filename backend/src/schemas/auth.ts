import { z } from 'zod';
import { fieldError, msg } from '../middleware/validate.js';

/** POST /api/auth/login（openapi.yaml）。帳號去除前後空白；密碼不做修改（spec Edge Cases）。 */
export const loginBody = z.object({
  account: z
    .string(
      fieldError(
        msg('請輸入學號或帳號', '請在「學號／帳號」欄位輸入你的學號'),
        msg('學號或帳號格式不正確', '請輸入文字'),
      ),
    )
    .trim()
    .min(1, msg('請輸入學號或帳號', '請在「學號／帳號」欄位輸入你的學號'))
    .max(64, msg('學號或帳號過長', '請確認輸入的學號是否正確')),
  password: z
    .string(
      fieldError(
        msg('請輸入密碼', '請在「密碼」欄位輸入密碼'),
        msg('密碼格式不正確', '請輸入文字'),
      ),
    )
    .min(1, msg('請輸入密碼', '請在「密碼」欄位輸入密碼'))
    .max(128, msg('密碼過長', '密碼最多 128 個字元')),
});

export type LoginBody = z.infer<typeof loginBody>;

const NEW_PASSWORD_HINT = '新密碼須為 8–64 個字元，且不可與預設密碼相同';

/** POST /api/auth/change-password（data-model.md「驗證規則：新密碼」）。「不得等於預設密碼」於服務層檢查。 */
export const changePasswordBody = z
  .object({
    currentPassword: z
      .string(
        fieldError(
          msg('請輸入目前密碼', '請輸入你現在登入使用的密碼'),
          msg('目前密碼格式不正確', '請輸入文字'),
        ),
      )
      .min(1, msg('請輸入目前密碼', '請輸入你現在登入使用的密碼'))
      .max(128, msg('目前密碼過長', '請確認輸入的密碼是否正確')),
    newPassword: z
      .string(
        fieldError(
          msg('請輸入新密碼', NEW_PASSWORD_HINT),
          msg('新密碼格式不正確', NEW_PASSWORD_HINT),
        ),
      )
      .min(8, msg('新密碼至少 8 個字元', NEW_PASSWORD_HINT))
      .max(64, msg('新密碼最多 64 個字元', NEW_PASSWORD_HINT)),
    confirmPassword: z.string(
      fieldError(
        msg('請再次輸入新密碼', '兩次輸入的新密碼必須相同'),
        msg('確認密碼格式不正確', '兩次輸入的新密碼必須相同'),
      ),
    ),
  })
  .refine((b) => b.newPassword === b.confirmPassword, {
    path: ['confirmPassword'],
    message: msg('兩次輸入的新密碼不一致', '請在兩個欄位輸入相同的新密碼'),
  });

export type ChangePasswordBody = z.infer<typeof changePasswordBody>;
