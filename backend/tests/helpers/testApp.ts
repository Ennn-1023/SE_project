import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import request from "supertest";
import type { Role } from "@se/shared";
import { createApp } from "../../src/app.js";
import { parseEnv } from "../../src/config/env.js";
import type { AppContext } from "../../src/context.js";
import { insertUser } from "../../src/db/users.js";
import { FakeClock } from "../../src/lib/clock.js";
import { openDatabase } from "../../src/lib/db.js";
import { createLogger } from "../../src/lib/logger.js";
import { hashPassword } from "../../src/lib/password.js";

/**
 * 測試用假值（憲章原則 III、IV）：不是任何真實密碼，只在測試中使用。
 */
export const TEST_ENV_SOURCE = {
  DATABASE_URL: ":memory:",
  SESSION_SECRET: "test-session-secret-0123456789abcdef-not-real",
  STUDENT_DEFAULT_PASSWORD: "fake-default-pw",
  TEACHER_INITIAL_PASSWORD: "fake-teacher-pw",
  TEACHER_USERNAME: "teacher",
  NODE_ENV: "test",
} as const;

export const DEFAULT_PW = TEST_ENV_SOURCE.STUDENT_DEFAULT_PASSWORD;
export const TEACHER_PW = TEST_ENV_SOURCE.TEACHER_INITIAL_PASSWORD;

export interface TestContext extends AppContext {
  clock: FakeClock;
  logs: string[];
  app: ReturnType<typeof createApp>;
}

/** 每次呼叫都是全新的記憶體資料庫、假時鐘與 app。 */
export function createTestContext(overrides: Partial<Record<string, string>> = {}): TestContext {
  const env = parseEnv({ ...TEST_ENV_SOURCE, ...overrides });
  const logs: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(String(chunk));
      callback();
    },
  });
  const ctx = {
    db: openDatabase(env.DATABASE_URL),
    env,
    clock: new FakeClock(),
    logger: createLogger({ level: "debug", destination }),
    logs,
  } as Omit<TestContext, "app">;
  return { ...ctx, app: createApp(ctx) };
}

/** 直接在資料庫建立帳號（不經過 API），讓各故事可獨立測試。 */
export async function createUser(
  ctx: AppContext,
  options: {
    username: string;
    role?: Role;
    password?: string;
    displayName?: string;
    group?: string | null;
    usesDefaultPassword?: boolean;
  },
): Promise<string> {
  const role = options.role ?? "STUDENT";
  const password = options.password ?? (role === "TEACHER" ? TEACHER_PW : DEFAULT_PW);
  const id = randomUUID();
  const now = ctx.clock.now().toISOString();
  insertUser(ctx.db, {
    id,
    username: options.username,
    display_name: options.displayName ?? (role === "TEACHER" ? "老師" : "測試學生"),
    role,
    group_label: options.group ?? null,
    password_hash: await hashPassword(password),
    uses_default_password: (options.usesDefaultPassword ?? true) ? 1 : 0,
    password_changed_at: now,
    created_by_id: null,
    created_at: now,
  });
  return id;
}

/** 回傳已登入的 supertest agent（會自動帶 cookie）。 */
export async function loginAs(
  ctx: TestContext,
  username: string,
  password: string,
): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(ctx.app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  if (res.status !== 200) {
    throw new Error(`loginAs 失敗：${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

export function countRows(ctx: AppContext, table: "users" | "sessions" | "security_events"): number {
  return (ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}
