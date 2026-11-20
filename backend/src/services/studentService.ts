import { randomUUID } from "node:crypto";
import type { CreateStudentData, StudentSummary } from "@se/shared";
import type { AppContext } from "../context.js";
import {
  findUserByUsername,
  insertUser,
  isUniqueViolation,
  toStudentSummary,
  updatePassword,
  type UserRow,
} from "../db/users.js";
import { revokeAllForUser } from "./sessionService.js";
import { errors } from "../lib/errors.js";
import { passwords } from "../lib/password.js";
import { recordEvent } from "./auditService.js";

/** 學生帳號管理只作用於 data-model.md User.role = STUDENT 的帳號。 */
function findStudent(ctx: AppContext, studentId: string): UserRow {
  const user = findUserByUsername(ctx.db, studentId);
  if (!user || user.role !== "STUDENT") throw errors.studentNotFound();
  return user;
}

/**
 * 新增學生（spec FR-002～FR-004）：
 * User.passwordHash 以 STUDENT_DEFAULT_PASSWORD 雜湊、User.role = STUDENT、User.usesDefaultPassword = true、
 * User.createdById = 目前老師。帳號名稱唯一性由資料庫 UNIQUE 約束保證（同時送出也只有一筆成功）。
 */
export async function createStudent(
  ctx: AppContext,
  input: CreateStudentData,
  actor: UserRow,
): Promise<StudentSummary> {
  const now = ctx.clock.now().toISOString();
  const row: UserRow = {
    id: randomUUID(),
    username: input.studentId,
    display_name: input.name,
    role: "STUDENT",
    group_label: input.group,
    password_hash: await passwords.hashPassword(ctx.env.STUDENT_DEFAULT_PASSWORD),
    uses_default_password: 1,
    password_changed_at: now,
    created_by_id: actor.id,
    created_at: now,
  };
  try {
    insertUser(ctx.db, row);
  } catch (error) {
    if (isUniqueViolation(error)) throw errors.accountExists(input.studentId);
    throw error;
  }
  recordEvent(ctx, "STUDENT_CREATED", { actorUsername: actor.username, targetUsername: row.username });
  return toStudentSummary(row);
}

/** 學生清單（FR-005）：依學號遞增排序，不含任何密碼資訊。 */
export function listStudents(ctx: AppContext): StudentSummary[] {
  const rows = ctx.db
    .prepare("SELECT * FROM users WHERE role = 'STUDENT' ORDER BY username ASC")
    .all() as unknown as UserRow[];
  return rows.map(toStudentSummary);
}

/**
 * 重設學生密碼（spec FR-019）：只作用於 User.role = STUDENT；以預設密碼重新雜湊 User.passwordHash、
 * User.usesDefaultPassword 設為 true、更新 User.passwordChangedAt，並讓該學生所有 session 失效。
 */
export async function resetPassword(ctx: AppContext, studentId: string, actor: UserRow): Promise<void> {
  const student = findStudent(ctx, studentId);
  const hash = await passwords.hashPassword(ctx.env.STUDENT_DEFAULT_PASSWORD);
  updatePassword(ctx.db, student.id, hash, true, ctx.clock.now().toISOString());
  revokeAllForUser(ctx, student.id);
  recordEvent(ctx, "PASSWORD_RESET", { actorUsername: actor.username, targetUsername: student.username });
}

/** 刪除學生（FR-006a）：該學生的 session 由 ON DELETE CASCADE 一併刪除。 */
export function deleteStudent(ctx: AppContext, studentId: string, actor: UserRow): void {
  const student = findStudent(ctx, studentId);
  ctx.db.prepare("DELETE FROM users WHERE id = ?").run(student.id);
  recordEvent(ctx, "STUDENT_DELETED", { actorUsername: actor.username, targetUsername: student.username });
}
