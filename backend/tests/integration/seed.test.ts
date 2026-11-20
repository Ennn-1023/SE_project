import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { findUserByUsername, updatePassword } from "../../src/db/users.js";
import { hashPassword } from "../../src/lib/password.js";
import { ensureTeacher } from "../../src/seed.js";
import { TEACHER_PW, countRows, createTestContext, type TestContext } from "../helpers/testApp.js";

describe("US2 老師帳號初始化與登入（FR-001）", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it("空資料庫時建立一個老師帳號", async () => {
    expect(await ensureTeacher(ctx)).toBe("created");
    const teacher = findUserByUsername(ctx.db, "teacher");
    expect(teacher).toMatchObject({
      role: "TEACHER",
      display_name: "老師",
      uses_default_password: 1,
      created_by_id: null,
    });
    expect(teacher?.password_hash).not.toContain(TEACHER_PW);
  });

  it("重複執行不新增帳號、不改密碼雜湊", async () => {
    await ensureTeacher(ctx);
    const before = findUserByUsername(ctx.db, "teacher")?.password_hash;
    expect(await ensureTeacher(ctx)).toBe("exists");
    expect(countRows(ctx, "users")).toBe(1);
    expect(findUserByUsername(ctx.db, "teacher")?.password_hash).toBe(before);
  });

  it("老師改過密碼後再執行初始化，改過的密碼仍可登入（US2-3）", async () => {
    await ensureTeacher(ctx);
    const teacher = findUserByUsername(ctx.db, "teacher")!;
    updatePassword(ctx.db, teacher.id, await hashPassword("changed-teacher-pw"), false, ctx.clock.now().toISOString());
    await ensureTeacher(ctx);

    const changed = await request(ctx.app).post("/api/auth/login").send({ username: "teacher", password: "changed-teacher-pw" });
    expect(changed.status).toBe(200);
    const initial = await request(ctx.app).post("/api/auth/login").send({ username: "teacher", password: TEACHER_PW });
    expect(initial.status).toBe(401);
  });

  it("使用 TEACHER_USERNAME 設定的帳號名稱", async () => {
    const custom = createTestContext({ TEACHER_USERNAME: "mr-lin" });
    await ensureTeacher(custom);
    expect(findUserByUsername(custom.db, "mr-lin")?.role).toBe("TEACHER");
  });

  it("老師以初始密碼登入，導向 /teacher（US2-1）", async () => {
    await ensureTeacher(ctx);
    const res = await request(ctx.app).post("/api/auth/login").send({ username: "teacher", password: TEACHER_PW });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { username: "teacher", displayName: "老師", role: "TEACHER", usesDefaultPassword: true },
      redirectTo: "/teacher",
    });
  });

  it("初始化的輸出訊息不含密碼", async () => {
    await ensureTeacher(ctx);
    expect(ctx.logs.join("")).not.toContain(TEACHER_PW);
  });
});
