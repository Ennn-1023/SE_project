import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as passwordLib from "../../src/lib/password.js";
import { DEFAULT_PW, countRows, createTestContext, createUser, type TestContext } from "../helpers/testApp.js";

describe("US1 學生登入：POST /api/auth/login、GET /api/auth/me", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = createTestContext();
    await createUser(ctx, { username: "411000001", displayName: "王小明" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("學號＋預設密碼登入成功，導向 /student 並設定安全的 cookie（US1-1）", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .send({ username: "411000001", password: DEFAULT_PW });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { username: "411000001", displayName: "王小明", role: "STUDENT", usesDefaultPassword: true },
      redirectTo: "/student",
    });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).not.toMatch(/Secure/i); // 非 production 不加 Secure
  });

  it("學號前後有空白也能登入", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .send({ username: "  411000001 ", password: DEFAULT_PW });
    expect(res.status).toBe(200);
  });

  it("production 環境的 cookie 加上 Secure", async () => {
    const prod = createTestContext({ NODE_ENV: "production" });
    await createUser(prod, { username: "411000001" });
    const res = await request(prod.app).post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    expect(String(res.headers["set-cookie"])).toMatch(/Secure/i);
  });

  it("錯誤密碼與不存在的學號回應完全相同（US1-2、US1-3、FR-009）", async () => {
    const wrong = await request(ctx.app)
      .post("/api/auth/login")
      .send({ username: "411000001", password: "wrong-password" });
    const missing = await request(ctx.app)
      .post("/api/auth/login")
      .send({ username: "499999999", password: "wrong-password" });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
    expect(wrong.body.error).toMatchObject({ code: "INVALID_CREDENTIALS", message: "學號或密碼錯誤" });
    expect(wrong.headers["set-cookie"]).toBeUndefined();
  });

  it("學號不存在時仍執行恰好一次密碼比對（FR-009、research.md R6）", async () => {
    const spy = vi.spyOn(passwordLib.passwords, "verifyPassword");
    await request(ctx.app).post("/api/auth/login").send({ username: "499999999", password: "whatever-1" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: "whatever-1" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("帳號與密碼皆空時一次列出兩個欄位（US1-4）", async () => {
    const res = await request(ctx.app).post("/api/auth/login").send({ username: "", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(["username", "password"]);
  });

  it("沒有送出任何內容時說明兩個欄位為必填", async () => {
    const res = await request(ctx.app).post("/api/auth/login");
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveLength(2);
  });

  it("帳號 21 字元被拒並說明格式（US1-5）", async () => {
    const res = await request(ctx.app).post("/api/auth/login").send({ username: "1".repeat(21), password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ field: "username", message: "帳號最多 20 個字元" });
  });

  it("超過 10 KB（11,000 字元）的輸入回 413，不進行比對", async () => {
    const spy = vi.spyOn(passwordLib.passwords, "verifyPassword");
    const res = await request(ctx.app).post("/api/auth/login").send({ username: "4".repeat(11_000), password: "x" });
    expect(res.status).toBe(413);
    expect(spy).not.toHaveBeenCalled();
  });

  it("連續 10 次錯誤後，正確密碼仍立即登入成功（FR-010）", async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: `bad-${i}` });
      expect(res.status).toBe(401);
    }
    const ok = await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    expect(ok.status).toBe(200);
  });

  it("成功與失敗皆寫入安全事件，資料庫與 log 中沒有密碼（FR-021、FR-024）", async () => {
    await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: "typo-password" });
    await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    const events = ctx.db.prepare("SELECT type, actor_username FROM security_events ORDER BY occurred_at").all();
    expect(events.map((e) => e.type).sort()).toEqual(["LOGIN_FAILURE", "LOGIN_SUCCESS"]);
    expect(events.every((e) => e.actor_username === "411000001")).toBe(true);

    const dump = JSON.stringify([
      ctx.db.prepare("SELECT * FROM security_events").all(),
      ctx.db.prepare("SELECT * FROM sessions").all(),
      ctx.db.prepare("SELECT * FROM users").all(),
    ]);
    expect(dump).not.toContain("typo-password");
    expect(dump).not.toContain(DEFAULT_PW);
    expect(ctx.logs.join("")).not.toContain("typo-password");
    expect(ctx.logs.join("")).not.toContain(DEFAULT_PW);
  });

  it("同一學生可在兩個裝置同時登入，兩邊都有效（spec Edge Cases）", async () => {
    const a = request.agent(ctx.app);
    const b = request.agent(ctx.app);
    await a.post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    await b.post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    expect((await a.get("/api/auth/me")).status).toBe(200);
    expect((await b.get("/api/auth/me")).status).toBe(200);
    expect(countRows(ctx, "sessions")).toBe(2);
  });

  it("GET /me：未登入回 401 UNAUTHENTICATED；登入後回目前使用者且不含密碼雜湊", async () => {
    const anonymous = await request(ctx.app).get("/api/auth/me");
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe("UNAUTHENTICATED");

    const agent = request.agent(ctx.app);
    await agent.post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      user: { username: "411000001", displayName: "王小明", role: "STUDENT", usesDefaultPassword: true },
    });
    expect(JSON.stringify(me.body)).not.toMatch(/hash|scrypt/i);
  });
});
