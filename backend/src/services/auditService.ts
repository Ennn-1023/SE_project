import { randomUUID } from "node:crypto";
import type { AppContext } from "../context.js";

/** data-model.md SecurityEvent.type */
export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "STUDENT_CREATED"
  | "STUDENT_DELETED";

/**
 * 寫入安全事件（spec FR-024）。刻意不接收密碼、token 等參數。
 * actorUsername 截斷至 20 字元（data-model.md SecurityEvent.actorUsername）。
 */
export function recordEvent(
  ctx: AppContext,
  type: SecurityEventType,
  people: { actorUsername?: string | null; targetUsername?: string | null } = {},
): void {
  const actor = people.actorUsername ? people.actorUsername.slice(0, 20) : null;
  const target = people.targetUsername ?? null;
  ctx.db
    .prepare(
      `INSERT INTO security_events (id, type, actor_username, target_username, occurred_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), type, actor, target, ctx.clock.now().toISOString());
  ctx.logger.info({ event: type, actor, target }, "security event");
}
