import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AppContext } from "../context.js";
import { HOUR, MINUTE } from "../lib/clock.js";
import type { UserRow } from "../db/users.js";

/** Session 規則（data-model.md Session、spec FR-016）。 */
export const IDLE_TIMEOUT_MS = 2 * HOUR;
export const ABSOLUTE_TIMEOUT_MS = 12 * HOUR;
export const TOUCH_INTERVAL_MS = MINUTE;

export interface SessionRow {
  id: string;
  token_hash: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

export type ResolveResult =
  | { status: "valid"; session: SessionRow; user: UserRow }
  | { status: "invalid" }
  | { status: "expired" };

/** 只存 token 的 SHA-256（data-model.md Session.tokenHash），資料庫外洩也無法直接冒用。 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(ctx: AppContext, userId: string): { token: string; sessionId: string } {
  const token = randomBytes(32).toString("base64url");
  const now = ctx.clock.now();
  const sessionId = randomUUID();
  ctx.db
    .prepare(
      `INSERT INTO sessions (id, token_hash, user_id, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sessionId,
      hashToken(token),
      userId,
      now.toISOString(),
      now.toISOString(),
      new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS).toISOString(),
    );
  return { token, sessionId };
}

/**
 * 檢查 session 是否有效：存在、未超過 Session.expiresAt、閒置（Session.lastSeenAt）未滿 2 小時。
 * 失效的 session 直接刪除。有效時最多每 60 秒更新一次 lastSeenAt。
 */
export function resolveSession(ctx: AppContext, token: string): ResolveResult {
  const session = ctx.db
    .prepare("SELECT * FROM sessions WHERE token_hash = ?")
    .get(hashToken(token)) as SessionRow | undefined;
  if (!session) return { status: "invalid" };

  const now = ctx.clock.now().getTime();
  const lastSeen = Date.parse(session.last_seen_at);
  if (now >= Date.parse(session.expires_at) || now - lastSeen >= IDLE_TIMEOUT_MS) {
    revokeSession(ctx, session.id);
    return { status: "expired" };
  }

  const user = ctx.db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) as
    | UserRow
    | undefined;
  if (!user) {
    revokeSession(ctx, session.id);
    return { status: "invalid" };
  }

  if (now - lastSeen >= TOUCH_INTERVAL_MS) {
    const touched = new Date(now).toISOString();
    ctx.db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(touched, session.id);
    session.last_seen_at = touched;
  }
  return { status: "valid", session, user };
}

export function revokeSession(ctx: AppContext, sessionId: string): void {
  ctx.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

/** 讓某帳號的所有 session 失效；可保留目前這一筆（FR-020）。 */
export function revokeAllForUser(ctx: AppContext, userId: string, exceptSessionId?: string): void {
  if (exceptSessionId) {
    ctx.db
      .prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?")
      .run(userId, exceptSessionId);
  } else {
    ctx.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }
}
