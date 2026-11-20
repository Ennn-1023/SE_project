import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * 環境變數驗證（research.md R8、spec FR-022、憲章原則 III）。
 * 錯誤訊息只包含變數名稱與原因，絕不包含變數的值。
 */
const password = (name: string) =>
  z
    .string({ error: `缺少必要的環境變數 ${name}` })
    .min(8, `${name} 必須為 8–64 個字元`)
    .max(64, `${name} 必須為 8–64 個字元`);

const envSchema = z.object({
  DATABASE_URL: z
    .string({ error: "缺少必要的環境變數 DATABASE_URL" })
    .min(1, "缺少必要的環境變數 DATABASE_URL"),
  SESSION_SECRET: z
    .string({ error: "缺少必要的環境變數 SESSION_SECRET" })
    .min(32, "SESSION_SECRET 至少需要 32 個字元"),
  STUDENT_DEFAULT_PASSWORD: password("STUDENT_DEFAULT_PASSWORD"),
  TEACHER_INITIAL_PASSWORD: password("TEACHER_INITIAL_PASSWORD"),
  // data-model.md User.username（老師）：1–20 字元、不含空白、不可為 9 位數字
  TEACHER_USERNAME: z
    .string()
    .trim()
    .min(1, "TEACHER_USERNAME 必須為 1–20 個字元")
    .max(20, "TEACHER_USERNAME 必須為 1–20 個字元")
    .regex(/^\S+$/, "TEACHER_USERNAME 不可包含空白")
    .refine((value) => !/^[0-9]{9}$/.test(value), "TEACHER_USERNAME 不可為 9 位數字（會與學號衝突）")
    .default("teacher"),
  PORT: z.coerce
    .number({ error: "PORT 必須是 1–65535 的整數" })
    .int("PORT 必須是 1–65535 的整數")
    .min(1, "PORT 必須是 1–65535 的整數")
    .max(65535, "PORT 必須是 1–65535 的整數")
    .default(3000),
  NODE_ENV: z
    .enum(["development", "test", "production"], {
      error: "NODE_ENV 必須是 development、test 或 production",
    })
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`環境變數設定錯誤：\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "EnvError";
  }
}

/** 空字串視為未設定，讓 .env.template 中留空的選填變數使用預設值。 */
function dropEmpty(source: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== "") result[key] = value;
  }
  return result;
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(dropEmpty(source));
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => issue.message);
  throw new EnvError([...new Set(problems)]);
}

/** 若專案根目錄有 .env 就載入（不覆寫已存在的系統環境變數）。 */
export function loadDotEnv(): void {
  const path = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

/** 伺服器啟動用：驗證失敗時印出問題（不含值）並停止。 */
export function loadEnvOrExit(): Env {
  loadDotEnv();
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      console.error("請參考 .env.template 設定 .env 後再啟動。");
      process.exit(1);
    }
    throw error;
  }
}
