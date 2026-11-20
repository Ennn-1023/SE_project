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

describe("US3 老師新增／檢視／刪除學生帳號", () => {
  let ctx: TestContext;
  let teacher: Awaited<ReturnType<typeof loginAs>>;

  beforeEach(async () => {
    ctx = createTestContext();
    await createUser(ctx, { username: "teacher", role: "TEACHER" });
    teacher = await loginAs(ctx, "teacher", TEACHER_PW);
  });

  it("新增成功回 201，學生可用學號＋預設密碼登入（US3-1、SC-003）", async () => {
    const res = await teacher.post("/api/students").send({ studentId: "411000001", name: "王小明" });
    expect(res.status).toBe(201);
    expect(res.body.student).toMatchObject({
      studentId: "411000001",
      name: "王小明",
      group: null,
      usesDefaultPassword: true,
    });
    const login = await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    expect(login.status).toBe(200);
    expect(login.body.redirectTo).toBe("/student");
  });

  it("新增的帳號記錄建立者與學生身分類別", async () => {
    await teacher.post("/api/students").send({ studentId: "411000001", name: "王小明" });
    const row = findUserByUsername(ctx.db, "411000001")!;
    const teacherRow = findUserByUsername(ctx.db, "teacher")!;
    expect(row.role).toBe("STUDENT");
    expect(row.created_by_id).toBe(teacherRow.id);
    expect(row.password_hash).not.toContain(DEFAULT_PW);
  });

  it("組別被保存；空字串組別存為 null（US3-5）", async () => {
    const withGroup = await teacher.post("/api/students").send({ studentId: "411000001", name: "甲", group: " A " });
    expect(withGroup.body.student.group).toBe("A");
    const empty = await teacher.post("/api/students").send({ studentId: "411000002", name: "乙", group: "" });
    expect(empty.body.student.group).toBeNull();
  });

  it("重複學號回 409，原帳號密碼雜湊不變（US3-2）", async () => {
    await teacher.post("/api/students").send({ studentId: "411000001", name: "王小明" });
    const before = findUserByUsername(ctx.db, "411000001")!.password_hash;
    const res = await teacher.post("/api/students").send({ studentId: "411000001", name: "別人" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "ACCOUNT_EXISTS", message: "學號 411000001 已存在" });
    const after = findUserByUsername(ctx.db, "411000001")!;
    expect(after.password_hash).toBe(before);
    expect(after.display_name).toBe("王小明");
  });

  it("兩個同時送出的相同學號只有一個成功（spec Edge Cases 連按兩次）", async () => {
    const [a, b] = await Promise.all([
      teacher.post("/api/students").send({ studentId: "411000001", name: "王小明" }),
      teacher.post("/api/students").send({ studentId: "411000001", name: "王小明" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(countRows(ctx, "users")).toBe(2); // 老師 + 1 位學生
  });

  it("學號 8 碼且姓名空白時一次列出兩欄，且不建立帳號（US3-3、US3-4、SC-006）", async () => {
    const res = await teacher.post("/api/students").send({ studentId: "41100001", name: "  " });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ field: "studentId", message: "學號須為 9 位數字" }),
      expect.objectContaining({ field: "name", message: "請輸入姓名" }),
    ]);
    expect(countRows(ctx, "users")).toBe(1);
  });

  it("GET 依學號遞增排序、只列學生，且回應中沒有任何密碼欄位（US3-6、FR-005）", async () => {
    await teacher.post("/api/students").send({ studentId: "411000003", name: "丙" });
    await teacher.post("/api/students").send({ studentId: "000000001", name: "甲", group: "B" });
    await teacher.post("/api/students").send({ studentId: "411000002", name: "乙" });
    const res = await teacher.get("/api/students");
    expect(res.status).toBe(200);
    expect(res.body.students.map((s: { studentId: string }) => s.studentId)).toEqual([
      "000000001",
      "411000002",
      "411000003",
    ]);
    expect(Object.keys(res.body.students[0]).sort()).toEqual(
      ["createdAt", "group", "name", "studentId", "usesDefaultPassword"].sort(),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|passwordHash|scrypt/);
  });

  it("刪除回 204；該學生 session 失效、無法登入，可再次新增同學號（US3-7、FR-006a）", async () => {
    await teacher.post("/api/students").send({ studentId: "411000001", name: "王小明" });
    const student = await loginAs(ctx, "411000001", DEFAULT_PW);

    const res = await teacher.delete("/api/students/411000001");
    expect(res.status).toBe(204);

    const me = await student.get("/api/auth/me");
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("UNAUTHENTICATED");

    const relogin = await request(ctx.app).post("/api/auth/login").send({ username: "411000001", password: DEFAULT_PW });
    expect(relogin.status).toBe(401);
    expect(relogin.body.error.code).toBe("INVALID_CREDENTIALS");

    const again = await teacher.post("/api/students").send({ studentId: "411000001", name: "王小明" });
    expect(again.status).toBe(201);
  });

  it("刪除不存在的學號回 404「找不到此學生帳號」，不影響其他帳號", async () => {
    await teacher.post("/api/students").send({ studentId: "411000001", name: "王小明" });
    const res = await teacher.delete("/api/students/499999999");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: "STUDENT_NOT_FOUND", message: "找不到此學生帳號" });
    expect(countRows(ctx, "users")).toBe(2);
  });

  it("路徑學號格式錯誤回 400；老師帳號名稱不會被當成學生刪除", async () => {
    const res = await teacher.delete("/api/students/4110");
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe("studentId");
    const teacherDelete = await teacher.delete("/api/students/teacher");
    expect(teacherDelete.status).toBe(400);
    expect(findUserByUsername(ctx.db, "teacher")).toBeDefined();
  });

  it("新增與刪除皆寫入安全事件（FR-024）", async () => {
    await teacher.post("/api/students").send({ studentId: "411000001", name: "王小明" });
    await teacher.delete("/api/students/411000001");
    const events = ctx.db
      .prepare("SELECT type, actor_username, target_username FROM security_events WHERE type LIKE 'STUDENT_%' ORDER BY type")
      .all();
    expect(events).toEqual([
      expect.objectContaining({ type: "STUDENT_CREATED", actor_username: "teacher", target_username: "411000001" }),
      expect.objectContaining({ type: "STUDENT_DELETED", actor_username: "teacher", target_username: "411000001" }),
    ]);
  });
});
