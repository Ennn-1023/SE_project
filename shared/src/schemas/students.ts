import { z } from "zod";
import { issue, requiredString, studentIdSchema } from "./common.js";

/**
 * 新增學生輸入：
 * - studentId → data-model.md User.username（學生）
 * - name → data-model.md User.displayName
 * - group → data-model.md User.groupLabel（空字串轉為 null）
 */
export const createStudentInput = z.object({
  studentId: studentIdSchema,
  name: requiredString("姓名")
    .trim()
    .min(1, issue("請輸入姓名", "姓名為必填欄位"))
    .max(50, issue("姓名最多 50 個字元", "請縮短姓名")),
  group: z
    .string({ error: issue("組別格式錯誤", "組別請輸入文字，或留空") })
    .trim()
    .max(20, issue("組別最多 20 個字元", "請縮短組別名稱，或留空"))
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
});

export type CreateStudentInput = z.input<typeof createStudentInput>;
export type CreateStudentData = z.output<typeof createStudentInput>;

/** 路徑參數 :studentId。 */
export const studentIdParam = z.object({ studentId: studentIdSchema });
