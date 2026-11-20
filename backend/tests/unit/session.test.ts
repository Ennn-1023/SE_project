import { beforeEach, describe, expect, it } from "vitest";
import { HOUR, MINUTE } from "../../src/lib/clock.js";
import {
  createSession,
  resolveSession,
  revokeAllForUser,
  type SessionRow,
} from "../../src/services/sessionService.js";
import { countRows, createTestContext, createUser, type TestContext } from "../helpers/testApp.js";

describe("Session 逾時（spec FR-016、data-model.md Session）", () => {
  let ctx: TestContext;
  let userId: string;

  beforeEach(async () => {
    ctx = createTestContext();
    userId = await createUser(ctx, { username: "411000001" });
  });

  function lastSeen(sessionId: string): string {
    return (ctx.db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as unknown as SessionRow).last_seen_at;
  }

  it("資料庫只存 token 雜湊，不存原始 token", () => {
    const { token } = createSession(ctx, userId);
    const row = ctx.db.prepare("SELECT * FROM sessions").get() as unknown as SessionRow;
    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("不存在的 token 為 invalid", () => {
    expect(resolveSession(ctx, "nope").status).toBe("invalid");
  });

  it("閒置 1 小時 59 分仍有效；閒置滿 2 小時失效並刪除", () => {
    const { token } = createSession(ctx, userId);
    ctx.clock.advance(2 * HOUR - MINUTE);
    expect(resolveSession(ctx, token).status).toBe("valid");

    const second = createSession(ctx, userId);
    ctx.clock.advance(2 * HOUR);
    expect(resolveSession(ctx, second.token).status).toBe("expired");
    expect(resolveSession(ctx, second.token).status).toBe("invalid");
  });

  it("持續活動但登入滿 12 小時後失效", () => {
    const { token } = createSession(ctx, userId);
    for (let i = 0; i < 23; i += 1) {
      ctx.clock.advance(30 * MINUTE);
      expect(resolveSession(ctx, token).status).toBe("valid");
    }
    ctx.clock.advance(30 * MINUTE); // 共 12 小時
    expect(resolveSession(ctx, token).status).toBe("expired");
  });

  it("lastSeenAt 60 秒內不重複寫入，超過才更新", () => {
    const { token, sessionId } = createSession(ctx, userId);
    const initial = lastSeen(sessionId);
    ctx.clock.advance(30 * 1000);
    resolveSession(ctx, token);
    expect(lastSeen(sessionId)).toBe(initial);
    ctx.clock.advance(31 * 1000);
    resolveSession(ctx, token);
    expect(lastSeen(sessionId)).not.toBe(initial);
  });

  it("revokeAllForUser 可保留指定的 session", () => {
    const keep = createSession(ctx, userId);
    const other = createSession(ctx, userId);
    revokeAllForUser(ctx, userId, keep.sessionId);
    expect(resolveSession(ctx, keep.token).status).toBe("valid");
    expect(resolveSession(ctx, other.token).status).toBe("invalid");
    revokeAllForUser(ctx, userId);
    expect(countRows(ctx, "sessions")).toBe(0);
  });

  it("刪除帳號時 session 一併刪除（ON DELETE CASCADE）", () => {
    createSession(ctx, userId);
    ctx.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    expect(countRows(ctx, "sessions")).toBe(0);
  });
});
