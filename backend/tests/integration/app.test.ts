import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../helpers/testApp.js";

describe("app 基礎行為（統一錯誤格式、body 上限、Content-Type）", () => {
  it("不存在的 API 回 404 與統一錯誤格式", async () => {
    const { app } = createTestContext();
    const res = await request(app).get("/api/unknown");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "找不到此 API", hint: "請確認網址是否正確" },
    });
  });

  it("超過 10 KB 的 body 回 413", async () => {
    const { app } = createTestContext();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "a".repeat(10_000), password: "x".repeat(10_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("有內容但不是 JSON 的 POST 回 415", async () => {
    const { app } = createTestContext();
    const res = await request(app).post("/api/auth/login").set("Content-Type", "text/plain").send("hello");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("無效的 JSON 回 400 並說明原因，不洩漏內部錯誤", async () => {
    const { app } = createTestContext();
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts|SyntaxError/);
  });
});
