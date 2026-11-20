import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { findUserByUsername } from "../../src/db/users.js";
import {
  DEFAULT_PW,
  TEACHER_PW,
  createTestContext,
  createUser,
  loginAs,
  type TestContext,
} from "../helpers/testApp.js";

const NEW_PW = "my-own-pass-1";

describe("US6 修改密碼（FR-017、FR-018、FR-020）", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = createTestContext();
    await createUser(ctx, { username: "411000001" });
  });

  function change(agent: Awaited<ReturnType<typeof loginAs>>, body: Record<string, string>) {
    return agent.post("/api/auth/password").send(body);
  }

  it("成功回 204：目前 session 仍有效，其他裝置登出，新密碼可登入、舊密碼不行（US6-1）", async () => {
    const current = await loginAs(ctx, "411000001", DEFAULT_PW);
    const other = await loginAs(ctx, "411000001", DEFAULT_PW);

    const res = await change(current, { currentPassword: DEFAULT_PW, newPassword: NEW_PW, confirmPassword: NEW_PW });
    expect(res.status).toBe(204);

    const me = await current.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.usesDefaultPassword).toBe(false);
    expect((await other.get("/api/auth/me")).status).toBe(401);

    const oldLogin = await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: NEW_PW });
    expect(newLogin.status).toBe(200);
  });

  it("目前密碼錯誤回 401 WRONG_CURRENT_PASSWORD，登入狀態不受影響（分析 F1）", async () => {
    const agent = await loginAs(ctx, "411000001", DEFAULT_PW);
    const res = await change(agent, { currentPassword: "not-my-pass", newPassword: NEW_PW, confirmPassword: NEW_PW });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: "WRONG_CURRENT_PASSWORD", message: "目前密碼錯誤" });
    expect((await agent.get("/api/auth/me")).status).toBe(200);
  });

  it("新密碼等於預設密碼回 400 PASSWORD_IS_DEFAULT（US6-2）", async () => {
    await createUser(ctx, { username: "411000002", password: "custom-pass-1", usesDefaultPassword: false });
    const agent = await loginAs(ctx, "411000002", "custom-pass-1");
    const res = await change(agent, { currentPassword: "custom-pass-1", newPassword: DEFAULT_PW, confirmPassword: DEFAULT_PW });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "PASSWORD_IS_DEFAULT", message: "新密碼不得與預設密碼相同" });
  });

  it("新密碼 7 字元、兩次不一致時回 400 並指出欄位", async () => {
    const agent = await loginAs(ctx, "411000001", DEFAULT_PW);
    const short = await change(agent, { currentPassword: DEFAULT_PW, newPassword: "1234567", confirmPassword: "1234567" });
    expect(short.status).toBe(400);
    expect(short.body.error.details[0]).toMatchObject({ field: "newPassword", message: "新密碼至少 8 個字元" });

    const mismatch = await change(agent, { currentPassword: DEFAULT_PW, newPassword: NEW_PW, confirmPassword: "other-pass-1" });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.details[0].field).toBe("confirmPassword");
  });

  it("未登入回 401", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/password")
      .send({ currentPassword: DEFAULT_PW, newPassword: NEW_PW, confirmPassword: NEW_PW });
    expect(res.status).toBe(401);
  });

  it("老師也可以修改自己的密碼", async () => {
    await createUser(ctx, { username: "teacher", role: "TEACHER" });
    const teacher = await loginAs(ctx, "teacher", TEACHER_PW);
    const res = await change(teacher, { currentPassword: TEACHER_PW, newPassword: NEW_PW, confirmPassword: NEW_PW });
    expect(res.status).toBe(204);
  });

  it("寫入 PASSWORD_CHANGED 事件，資料庫與 log 不含新密碼", async () => {
    const agent = await loginAs(ctx, "411000001", DEFAULT_PW);
    await change(agent, { currentPassword: DEFAULT_PW, newPassword: NEW_PW, confirmPassword: NEW_PW });
    const event = ctx.db.prepare("SELECT * FROM security_events WHERE type = 'PASSWORD_CHANGED'").get();
    expect(event).toMatchObject({ actor_username: "411000001" });
    const dump = JSON.stringify([ctx.db.prepare("SELECT * FROM users").all(), ctx.db.prepare("SELECT * FROM security_events").all()]);
    expect(dump).not.toContain(NEW_PW);
    expect(ctx.logs.join("")).not.toContain(NEW_PW);
  });
});

describe("US6 老師重設學生密碼（FR-019）", () => {
  let ctx: TestContext;
  let teacher: Awaited<ReturnType<typeof loginAs>>;

  beforeEach(async () => {
    ctx = createTestContext();
    await createUser(ctx, { username: "teacher", role: "TEACHER" });
    await createUser(ctx, { username: "411000001", password: "student-own-pw", usesDefaultPassword: false });
    teacher = await loginAs(ctx, "teacher", TEACHER_PW);
  });

  it("重設回 204：學生所有 session 失效，預設密碼可登入，usesDefaultPassword 變回 true（US6-3）", async () => {
    const student = await loginAs(ctx, "411000001", "student-own-pw");
    const res = await teacher.post("/api/students/411000001/reset-password");
    expect(res.status).toBe(204);

    expect((await student.get("/api/auth/me")).status).toBe(401);
    expect(findUserByUsername(ctx.db, "411000001")?.uses_default_password).toBe(1);
    const login = await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    expect(login.status).toBe(200);
    expect(login.body.user.usesDefaultPassword).toBe(true);
  });

  it("不帶 Content-Type 的重設請求仍回 204（分析 F2）", async () => {
    const res = await teacher.post("/api/students/411000001/reset-password").unset("Content-Type");
    expect(res.status).toBe(204);
  });

  it("重設不存在的學號回 404", async () => {
    const res = await teacher.post("/api/students/499999999/reset-password");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("STUDENT_NOT_FOUND");
  });

  it("學號格式錯誤回 400", async () => {
    const res = await teacher.post("/api/students/abc/reset-password");
    expect(res.status).toBe(400);
  });

  it("寫入 PASSWORD_RESET 事件", async () => {
    await teacher.post("/api/students/411000001/reset-password");
    const event = ctx.db.prepare("SELECT * FROM security_events WHERE type = 'PASSWORD_RESET'").get();
    expect(event).toMatchObject({ actor_username: "teacher", target_username: "411000001" });
  });
});
