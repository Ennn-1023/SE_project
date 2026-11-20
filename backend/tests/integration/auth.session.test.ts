import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { HOUR, MINUTE } from "../../src/lib/clock.js";
import { DEFAULT_PW, countRows, createTestContext, createUser, loginAs, type TestContext } from "../helpers/testApp.js";

describe("US5 登出與逾時（FR-015、FR-016）", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = createTestContext();
    await createUser(ctx, { username: "411000001" });
  });

  it("登出回 204、清除 cookie，舊 cookie 立即失效（US5-1）", async () => {
    const login = await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;

    const logout = await request(ctx.app).post("/api/auth/logout").set("Cookie", cookie).set("Content-Type", "application/json");
    expect(logout.status).toBe(204);
    expect(String(logout.headers["set-cookie"])).toMatch(/sid=;/);
    expect(countRows(ctx, "sessions")).toBe(0);

    const me = await request(ctx.app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("登出只影響目前這個裝置", async () => {
    const a = await loginAs(ctx, "411000001", DEFAULT_PW);
    const b = await loginAs(ctx, "411000001", DEFAULT_PW);
    await a.post("/api/auth/logout");
    expect((await a.get("/api/auth/me")).status).toBe(401);
    expect((await b.get("/api/auth/me")).status).toBe(200);
  });

  it("未登入呼叫登出也回 204（冪等）", async () => {
    const res = await request(ctx.app).post("/api/auth/logout");
    expect(res.status).toBe(204);
  });

  it("不帶 Content-Type 也沒有內容的登出請求不被 415 擋下（分析 F2）", async () => {
    const agent = await loginAs(ctx, "411000001", DEFAULT_PW);
    const res = await agent.post("/api/auth/logout").unset("Content-Type");
    expect(res.status).toBe(204);
  });

  it("以 text/plain 送出有內容的登入請求回 415", async () => {
    const res = await request(ctx.app).post("/api/auth/login").set("Content-Type", "text/plain").send("411000001");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("閒置滿 2 小時後回 401 SESSION_EXPIRED 並清除 cookie（US5-2）", async () => {
    const agent = await loginAs(ctx, "411000001", DEFAULT_PW);
    ctx.clock.advance(2 * HOUR);
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: "SESSION_EXPIRED", message: "登入已逾時，請重新登入" });
    expect(String(res.headers["set-cookie"])).toMatch(/sid=;/);
  });

  it("閒置 1 小時 59 分仍有效", async () => {
    const agent = await loginAs(ctx, "411000001", DEFAULT_PW);
    ctx.clock.advance(2 * HOUR - MINUTE);
    expect((await agent.get("/api/auth/me")).status).toBe(200);
  });

  it("每 30 分鐘活動一次，登入滿 12 小時後仍逾時", async () => {
    const agent = await loginAs(ctx, "411000001", DEFAULT_PW);
    for (let i = 0; i < 23; i += 1) {
      ctx.clock.advance(30 * MINUTE);
      expect((await agent.get("/api/auth/me")).status).toBe(200);
    }
    ctx.clock.advance(30 * MINUTE);
    const res = await agent.get("/api/auth/me");
    expect(res.body.error.code).toBe("SESSION_EXPIRED");
  });

  it("登出寫入 LOGOUT 安全事件", async () => {
    const agent = await loginAs(ctx, "411000001", DEFAULT_PW);
    await agent.post("/api/auth/logout");
    const event = ctx.db.prepare("SELECT actor_username FROM security_events WHERE type = 'LOGOUT'").get();
    expect(event).toMatchObject({ actor_username: "411000001" });
  });
});
