import { homePathFor, type ChangePasswordInput, type LoginInput, type LoginResponse } from "@se/shared";
import type { AppContext } from "../context.js";
import { findUserByUsername, toCurrentUser, updatePassword, type UserRow } from "../db/users.js";
import { errors } from "../lib/errors.js";
import { getDummyHash, passwords } from "../lib/password.js";
import { recordEvent } from "./auditService.js";
import { createSession, resolveSession, revokeAllForUser, revokeSession } from "./sessionService.js";

/**
 * 修改自己的密碼（spec FR-017、FR-018、FR-020）：
 * 更新 data-model.md User.passwordHash、User.usesDefaultPassword（false）、User.passwordChangedAt，
 * 並讓同帳號的其他 session 失效（保留目前這一筆）。
 */
export async function changePassword(
  ctx: AppContext,
  auth: { user: UserRow; sessionId: string },
  input: ChangePasswordInput,
): Promise<void> {
  const ok = await passwords.verifyPassword(input.currentPassword, auth.user.password_hash);
  if (!ok) throw errors.wrongCurrentPassword();
  if (input.newPassword === ctx.env.STUDENT_DEFAULT_PASSWORD) throw errors.passwordIsDefault();

  const hash = await passwords.hashPassword(input.newPassword);
  updatePassword(ctx.db, auth.user.id, hash, false, ctx.clock.now().toISOString());
  revokeAllForUser(ctx, auth.user.id, auth.sessionId);
  recordEvent(ctx, "PASSWORD_CHANGED", { actorUsername: auth.user.username });
}

/**
 * 登出（spec FR-015）：刪除目前 session 並記錄 LOGOUT。
 * 未登入、token 無效或已逾時時不做任何事（冪等）。
 */
export function logout(ctx: AppContext, token: unknown): void {
  if (typeof token !== "string" || token.length === 0) return;
  const result = resolveSession(ctx, token);
  if (result.status !== "valid") return;
  revokeSession(ctx, result.session.id);
  recordEvent(ctx, "LOGOUT", { actorUsername: result.user.username });
}

/**
 * 登入（spec FR-007、FR-009、FR-010）：
 * - 依 data-model.md User.username 查詢；不存在時仍對假雜湊比對一次，兩種失敗的工作量相同
 * - 不限制失敗次數、不鎖定帳號
 * - 導向依 data-model.md User.role 決定
 */
export async function login(
  ctx: AppContext,
  input: LoginInput,
): Promise<LoginResponse & { token: string }> {
  const user = findUserByUsername(ctx.db, input.username);
  const storedHash = user?.password_hash ?? (await getDummyHash());
  const matches = await passwords.verifyPassword(input.password, storedHash);

  if (!user || !matches) {
    recordEvent(ctx, "LOGIN_FAILURE", { actorUsername: input.username });
    throw errors.invalidCredentials();
  }

  const { token } = createSession(ctx, user.id);
  recordEvent(ctx, "LOGIN_SUCCESS", { actorUsername: user.username });
  return { user: toCurrentUser(user), redirectTo: homePathFor(user.role), token };
}
