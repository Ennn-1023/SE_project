import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, setSessionInvalidHandler } from "../src/api/client";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionInvalidHandler(undefined);
});

describe("API client 的 401 分流（contracts/api.md、分析 F1）", () => {
  it.each(["UNAUTHENTICATED", "SESSION_EXPIRED"])("%s 會觸發登出導向", async (code) => {
    const handler = vi.fn();
    setSessionInvalidHandler(handler);
    mockFetch(401, { error: { code, message: "x" } });
    await expect(api.get("/api/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledWith(code);
  });

  it.each(["INVALID_CREDENTIALS", "WRONG_CURRENT_PASSWORD"])(
    "%s 不觸發登出，錯誤交給呼叫端",
    async (code) => {
      const handler = vi.fn();
      setSessionInvalidHandler(handler);
      mockFetch(401, { error: { code, message: "錯誤", details: [{ field: "currentPassword", message: "目前密碼錯誤" }] } });
      const error = await api.post("/api/auth/password", {}).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe(code);
      expect((error as ApiError).fieldMessage("currentPassword")).toBe("目前密碼錯誤");
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("silent 選項下即使 UNAUTHENTICATED 也不觸發導向", async () => {
    const handler = vi.fn();
    setSessionInvalidHandler(handler);
    mockFetch(401, { error: { code: "UNAUTHENTICATED", message: "x" } });
    await expect(api.get("/api/auth/me", { silent: true })).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("204 回傳 undefined；POST 一律帶 JSON Content-Type", async () => {
    mockFetch(204, undefined);
    await expect(api.post("/api/auth/logout")).resolves.toBeUndefined();
    const call = vi.mocked(fetch).mock.calls[0]!;
    expect((call[1]?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("非 JSON 的錯誤回應轉成可讀訊息", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    const error = (await api.get("/api/x").catch((e: unknown) => e)) as ApiError;
    expect(error.message).toBe("系統發生錯誤，請稍後再試");
  });
});
