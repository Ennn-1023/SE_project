import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { findUserByUsername } from "../../src/db/users.js";
import {
  DEFAULT_PW,
  TEACHER_PW,
  countRows,
  createTestContext,
  createUser,
  loginAs,
  type TestContext,
} from "../helpers/testApp.js";

/** 所有老師功能（FR-014、contracts/api.md Students）。 */
const TEACHER_ENDPOINTS = [
  { method: "get", path: "/api/students", body: undefined },
  { method: "post", path: "/api/students", body: { studentId: "411000009", name: "入侵者" } },
  { method: "delete", path: "/api/students/411000002", body: undefined },
  { method: "post", path: "/api/students/411000002/reset-password", body: undefined },
] as const;

describe("US4 角色權限控管（FR-012、FR-013、SC-004）", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = createTestContext();
    await createUser(ctx, { username: "teacher", role: "TEACHER" });
    await createUser(ctx, { username: "411000001" });
    await createUser(ctx, { username: "411000002", password: "student-two-pw", usesDefaultPassword: false });
  });

  function snapshot() {
    return {
      users: countRows(ctx, "users"),
      hash: findUserByUsername(ctx.db, "411000002")?.password_hash,
      usesDefault: findUserByUsername(ctx.db, "411000002")?.uses_default_password,
    };
  }

  it.each(TEACHER_ENDPOINTS)("學生呼叫 $method $path 回 403「權限不足」且沒有任何副作用", async (endpoint) => {
    const student = await loginAs(ctx, "411000001", DEFAULT_PW);
    const before = snapshot();
    let call = student[endpoint.method](endpoint.path);
    if (endpoint.body) call = call.send(endpoint.body);
    const res = await call;
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: "FORBIDDEN", message: "權限不足" });
    expect(snapshot()).toEqual(before);
  });

  it.each(TEACHER_ENDPOINTS)("未登入呼叫 $method $path 回 401 UNAUTHENTICATED", async (endpoint) => {
    let call = request(ctx.app)[endpoint.method](endpoint.path);
    if (endpoint.body) call = call.send(endpoint.body);
    const res = await call;
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("竄改簽章的 cookie 視為未登入", async () => {
    const login = await request(ctx.app).post("/api/auth/login").send({ username: "teacher", password: TEACHER_PW });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const tampered = cookie.slice(0, -3) + (cookie.endsWith("abc") ? "xyz" : "abc");
    const res = await request(ctx.app).get("/api/students").set("Cookie", tampered);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("沒有簽章、直接複製 token 的 cookie 也視為未登入", async () => {
    const res = await request(ctx.app).get("/api/auth/me").set("Cookie", "sid=forged-token");
    expect(res.status).toBe(401);
  });

  it("老師呼叫老師功能正常執行（US4-4）", async () => {
    const teacher = await loginAs(ctx, "teacher", TEACHER_PW);
    expect((await teacher.get("/api/students")).status).toBe(200);
  });

  it("角色只依資料庫記錄判斷：9 位數字的帳號若記錄為老師，仍可使用老師功能", async () => {
    await createUser(ctx, { username: "999999999", role: "TEACHER", password: "digits-teacher-pw" });
    const odd = await loginAs(ctx, "999999999", "digits-teacher-pw");
    expect((await odd.get("/api/students")).status).toBe(200);
  });
});
