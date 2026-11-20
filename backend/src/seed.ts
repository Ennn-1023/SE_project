import { randomUUID } from "node:crypto";
import type { AppContext } from "./context.js";
import { insertUser, isUniqueViolation } from "./db/users.js";
import { passwords } from "./lib/password.js";

/**
 * 老師帳號初始化（spec FR-001、data-model.md User）：
 * 只在沒有任何 User.role = TEACHER 的帳號時建立；已存在則完全不動（不覆寫已變更的密碼）。
 */
export async function ensureTeacher(ctx: AppContext): Promise<"created" | "exists"> {
  const existing = ctx.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'TEACHER'").get() as {
    n: number;
  };
  if (existing.n > 0) {
    ctx.logger.info("老師帳號已存在，未變更");
    return "exists";
  }

  const now = ctx.clock.now().toISOString();
  try {
    insertUser(ctx.db, {
      id: randomUUID(),
      username: ctx.env.TEACHER_USERNAME, // User.username（老師）
      display_name: "老師", // User.displayName
      role: "TEACHER", // User.role
      group_label: null,
      password_hash: await passwords.hashPassword(ctx.env.TEACHER_INITIAL_PASSWORD), // User.passwordHash
      uses_default_password: 1, // User.usesDefaultPassword
      password_changed_at: now,
      created_by_id: null, // User.createdById：由初始化建立
      created_at: now,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(
        `無法建立老師帳號：帳號名稱「${ctx.env.TEACHER_USERNAME}」已被其他帳號使用，請修改 TEACHER_USERNAME`,
        { cause: error },
      );
    }
    throw error;
  }
  ctx.logger.info(`已建立老師帳號：${ctx.env.TEACHER_USERNAME}`);
  return "created";
}
