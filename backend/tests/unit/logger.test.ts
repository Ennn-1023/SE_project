import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/lib/logger.js";

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { lines, logger: createLogger({ destination }) };
}

describe("logger 遮罩機敏欄位（research.md R10、憲章原則 III）", () => {
  it("頂層與巢狀的密碼、cookie、token 欄位都被遮罩", () => {
    const { lines, logger } = capture();
    logger.info(
      {
        password: "secret-value-1",
        newPassword: "secret-value-2",
        cookie: "sid=secret-value-3",
        body: { currentPassword: "secret-value-4", confirmPassword: "secret-value-5", token: "secret-value-6" },
        req: { headers: { cookie: "sid=secret-value-7", authorization: "Bearer secret-value-8" } },
        user: { passwordHash: "scrypt$secret-value-9" },
        studentId: "411000001",
      },
      "測試",
    );
    const output = lines.join("");
    for (let i = 1; i <= 9; i += 1) expect(output).not.toContain(`secret-value-${i}`);
    expect(output).toContain("[已遮罩]");
    expect(output).toContain("411000001");
  });
});
