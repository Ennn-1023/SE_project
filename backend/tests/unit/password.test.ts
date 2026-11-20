import { describe, expect, it } from "vitest";
import { getDummyHash, hashPassword, verifyPassword } from "../../src/lib/password.js";

describe("密碼雜湊（research.md R4）", () => {
  it("同一密碼兩次雜湊結果不同（每次新的 salt），且都不含原密碼", async () => {
    const a = await hashPassword("example-pass-1");
    const b = await hashPassword("example-pass-1");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(a).not.toContain("example-pass-1");
  });

  it("正確密碼驗證成功、錯誤密碼失敗", async () => {
    const stored = await hashPassword("example-pass-1");
    expect(await verifyPassword("example-pass-1", stored)).toBe(true);
    expect(await verifyPassword("example-pass-2", stored)).toBe(false);
  });

  it("密碼前後空白不被修剪（spec Edge Cases）", async () => {
    const stored = await hashPassword(" spaced-pass ");
    expect(await verifyPassword(" spaced-pass ", stored)).toBe(true);
    expect(await verifyPassword("spaced-pass", stored)).toBe(false);
  });

  it("格式錯誤的雜湊一律驗證失敗而不拋錯", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("假雜湊可重複取得且不會與任何常見輸入相符", async () => {
    const dummy = await getDummyHash();
    expect(await getDummyHash()).toBe(dummy);
    expect(await verifyPassword("", dummy)).toBe(false);
  });
});
