import request from "supertest";
import { describe, expect, it } from "vitest";
import { insertUser } from "../../src/db/users.js";
import { hashPassword } from "../../src/lib/password.js";
import { DEFAULT_PW, countRows, createTestContext } from "../helpers/testApp.js";

describe("SC-002：50 人同時登入", () => {
  it("50 個學生帳號同時登入，全部成功且每個請求耗時 ≤ 2 秒", async () => {
    const ctx = createTestContext();
    const hash = await hashPassword(DEFAULT_PW);
    const now = ctx.clock.now().toISOString();
    const ids = Array.from({ length: 50 }, (_, i) => String(411000001 + i));
    for (const username of ids) {
      insertUser(ctx.db, {
        id: `id-${username}`,
        username,
        display_name: `學生${username}`,
        role: "STUDENT",
        group_label: null,
        password_hash: hash,
        uses_default_password: 1,
        password_changed_at: now,
        created_by_id: null,
        created_at: now,
      });
    }

    const results = await Promise.all(
      ids.map(async (username) => {
        const start = performance.now();
        const res = await request(ctx.app).post("/api/auth/login").send({ username, password: DEFAULT_PW });
        return { status: res.status, ms: performance.now() - start };
      }),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);
    const slowest = Math.max(...results.map((r) => r.ms));
    expect(slowest).toBeLessThanOrEqual(2000);
    expect(countRows(ctx, "sessions")).toBe(50);
  });
});
