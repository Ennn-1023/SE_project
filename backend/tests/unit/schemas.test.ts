import { describe, expect, it } from "vitest";
import {
  changePasswordInput,
  createStudentInput,
  loginInput,
  parseWith,
  studentIdParam,
} from "@se/shared";

function fieldsOf<T>(result: ReturnType<typeof parseWith<T>>): string[] {
  return result.ok ? [] : result.errors.map((e) => e.field);
}

describe("學號格式（data-model.md User.username，學生）", () => {
  it("9 位數字通過", () => {
    expect(parseWith(studentIdParam, { studentId: "411000001" }).ok).toBe(true);
  });

  it("開頭為 0 的學號通過且保留開頭 0", () => {
    const result = parseWith(createStudentInput, { studentId: "000123456", name: "甲" });
    expect(result.ok && result.data.studentId).toBe("000123456");
  });

  it.each([
    ["8 碼", "41100001"],
    ["10 碼", "4110000012"],
    ["含字母", "41100000A"],
    ["全形數字", "４１１０００００１"],
    ["中間含空白", "4110 0001"],
  ])("%s 被拒，訊息說明須為 9 位數字", (_label, studentId) => {
    const result = parseWith(createStudentInput, { studentId, name: "甲" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({ field: "studentId", message: "學號須為 9 位數字" });
      expect(result.errors[0]?.hint).toContain("9 位半形數字");
    }
  });

  it("前後空白會被去除", () => {
    const result = parseWith(createStudentInput, { studentId: "  411000001 ", name: " 王小明 " });
    expect(result.ok && result.data).toMatchObject({ studentId: "411000001", name: "王小明" });
  });
});

describe("新增學生輸入", () => {
  it("姓名只有空白時視為未填", () => {
    expect(fieldsOf(parseWith(createStudentInput, { studentId: "411000001", name: "   " }))).toEqual([
      "name",
    ]);
  });

  it("姓名 50 字元通過、51 字元被拒", () => {
    expect(parseWith(createStudentInput, { studentId: "411000001", name: "甲".repeat(50) }).ok).toBe(true);
    expect(fieldsOf(parseWith(createStudentInput, { studentId: "411000001", name: "甲".repeat(51) }))).toEqual([
      "name",
    ]);
  });

  it("組別 21 字元被拒；空字串組別轉為 null", () => {
    expect(
      fieldsOf(parseWith(createStudentInput, { studentId: "411000001", name: "甲", group: "A".repeat(21) })),
    ).toEqual(["group"]);
    const result = parseWith(createStudentInput, { studentId: "411000001", name: "甲", group: "  " });
    expect(result.ok && result.data.group).toBeNull();
  });

  it("多個欄位同時錯誤時全部列出", () => {
    expect(fieldsOf(parseWith(createStudentInput, { studentId: "41100001", name: "" }))).toEqual([
      "studentId",
      "name",
    ]);
  });

  it("缺少欄位時說明為必填", () => {
    const result = parseWith(createStudentInput, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.message)).toEqual(["請輸入學號", "請輸入姓名"]);
  });
});

describe("登入輸入（loginInput）", () => {
  it("帳號與密碼皆空時同時列出兩欄", () => {
    expect(fieldsOf(parseWith(loginInput, { username: "", password: "" }))).toEqual([
      "username",
      "password",
    ]);
  });

  it("老師帳號名稱（非數字）也可通過格式檢查", () => {
    expect(parseWith(loginInput, { username: "teacher", password: "x" }).ok).toBe(true);
  });

  it("帳號 21 字元或含空白被拒", () => {
    expect(fieldsOf(parseWith(loginInput, { username: "a".repeat(21), password: "x" }))).toEqual(["username"]);
    expect(fieldsOf(parseWith(loginInput, { username: "ab cd", password: "x" }))).toEqual(["username"]);
  });

  it("密碼 65 字元被拒，且密碼前後空白不被修剪", () => {
    expect(fieldsOf(parseWith(loginInput, { username: "a", password: "x".repeat(65) }))).toEqual(["password"]);
    const result = parseWith(loginInput, { username: "a", password: " pw " });
    expect(result.ok && result.data.password).toBe(" pw ");
  });
});

describe("修改密碼輸入（changePasswordInput）", () => {
  const base = { currentPassword: "old-pass", newPassword: "new-pass-1", confirmPassword: "new-pass-1" };

  it("合法時通過", () => {
    expect(parseWith(changePasswordInput, base).ok).toBe(true);
  });

  it("新密碼 7 字元或 65 字元被拒", () => {
    expect(fieldsOf(parseWith(changePasswordInput, { ...base, newPassword: "1234567", confirmPassword: "1234567" }))).toContain(
      "newPassword",
    );
    const long = "x".repeat(65);
    expect(fieldsOf(parseWith(changePasswordInput, { ...base, newPassword: long, confirmPassword: long }))).toContain(
      "newPassword",
    );
  });

  it("兩次新密碼不一致時指出確認欄位", () => {
    const result = parseWith(changePasswordInput, { ...base, confirmPassword: "different-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        expect.objectContaining({ field: "confirmPassword", message: "兩次輸入的新密碼不一致" }),
      ]);
    }
  });
});
