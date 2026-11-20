import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "../../src/config/env.js";
import { TEST_ENV_SOURCE } from "../helpers/testApp.js";

function problemsFor(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
  return [];
}

describe("環境變數驗證（FR-022、research.md R8）", () => {
  it("全部合法時通過，選填變數使用預設值", () => {
    const { TEACHER_USERNAME: _omit, ...rest } = TEST_ENV_SOURCE;
    const env = parseEnv({ ...rest, PORT: "" });
    expect(env.TEACHER_USERNAME).toBe("teacher");
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("test");
  });

  it("缺少 SESSION_SECRET 時指出變數名稱，且訊息不含任何設定值", () => {
    const { SESSION_SECRET: _omit, ...rest } = TEST_ENV_SOURCE;
    let message = "";
    try {
      parseEnv(rest);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("SESSION_SECRET");
    for (const value of Object.values(rest)) {
      if (value.length >= 6) expect(message).not.toContain(value);
    }
  });

  it("缺少 TEACHER_INITIAL_PASSWORD 時指出變數名稱（US2-2）", () => {
    const { TEACHER_INITIAL_PASSWORD: _omit, ...rest } = TEST_ENV_SOURCE;
    expect(problemsFor(rest).join("\n")).toContain("TEACHER_INITIAL_PASSWORD");
  });

  it("一次列出所有缺少的變數", () => {
    const problems = problemsFor({}).join("\n");
    for (const name of ["DATABASE_URL", "SESSION_SECRET", "STUDENT_DEFAULT_PASSWORD", "TEACHER_INITIAL_PASSWORD"]) {
      expect(problems).toContain(name);
    }
  });

  it("STUDENT_DEFAULT_PASSWORD 只有 7 個字元時被拒", () => {
    const problems = problemsFor({ ...TEST_ENV_SOURCE, STUDENT_DEFAULT_PASSWORD: "1234567" });
    expect(problems.join("\n")).toContain("STUDENT_DEFAULT_PASSWORD 必須為 8–64 個字元");
  });

  it("SESSION_SECRET 少於 32 字元時被拒", () => {
    expect(problemsFor({ ...TEST_ENV_SOURCE, SESSION_SECRET: "short" }).join()).toContain(
      "SESSION_SECRET",
    );
  });

  it("TEACHER_USERNAME 為 9 位數字時被拒（避免與學號衝突）", () => {
    const problems = problemsFor({ ...TEST_ENV_SOURCE, TEACHER_USERNAME: "411000001" });
    expect(problems.join()).toContain("TEACHER_USERNAME 不可為 9 位數字");
  });

  it("PORT 不是數字時被拒", () => {
    expect(problemsFor({ ...TEST_ENV_SOURCE, PORT: "abc" }).join()).toContain("PORT");
  });
});
