import { z } from "zod";
import { issue, requiredString, PASSWORD_MAX, NEW_PASSWORD_MIN } from "./common.js";

/**
 * 登入輸入（data-model.md 輸入驗證規則總表 loginInput；username 對應 data-model.md User.username）。
 * 帳號去除前後空白；密碼不做任何修剪。
 */
export const loginInput = z.object({
  username: requiredString("學號或帳號")
    .trim()
    .min(1, issue("請輸入學號或帳號", "學生請輸入 9 位數字學號"))
    .max(20, issue("帳號最多 20 個字元", "學生請輸入 9 位數字學號"))
    .regex(/^\S+$/, issue("帳號不可包含空白", "學生請輸入 9 位數字學號")),
  password: requiredString("密碼")
    .min(1, issue("請輸入密碼", "密碼為必填欄位"))
    .max(PASSWORD_MAX, issue(`密碼最多 ${PASSWORD_MAX} 個字元`, "請確認輸入的密碼是否正確")),
});

export type LoginInput = z.infer<typeof loginInput>;

/**
 * 修改密碼輸入（data-model.md 輸入驗證規則總表 changePasswordInput）。
 * 「新密碼不得等於預設密碼」只在伺服器端檢查（PASSWORD_IS_DEFAULT）。
 */
export const changePasswordInput = z
  .object({
    currentPassword: requiredString("目前密碼")
      .min(1, issue("請輸入目前密碼", "目前密碼為必填欄位"))
      .max(PASSWORD_MAX, issue(`密碼最多 ${PASSWORD_MAX} 個字元`, "請確認目前密碼是否正確")),
    newPassword: requiredString("新密碼")
      .min(
        NEW_PASSWORD_MIN,
        issue(`新密碼至少 ${NEW_PASSWORD_MIN} 個字元`, `請輸入 ${NEW_PASSWORD_MIN}–${PASSWORD_MAX} 個字元`),
      )
      .max(
        PASSWORD_MAX,
        issue(`新密碼最多 ${PASSWORD_MAX} 個字元`, `請輸入 ${NEW_PASSWORD_MIN}–${PASSWORD_MAX} 個字元`),
      ),
    confirmPassword: requiredString("確認新密碼"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: issue("兩次輸入的新密碼不一致", "請再輸入一次相同的新密碼"),
  });

export type ChangePasswordInput = z.infer<typeof changePasswordInput>;
