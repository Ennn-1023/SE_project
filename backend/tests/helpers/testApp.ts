import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { Config } from '../../src/config/env.js';
import { migrate } from '../../src/db/migrations.js';
import { createFakeClock, type FakeClock } from '../../src/lib/clock.js';
import { openDatabase } from '../../src/lib/db.js';
import { createLogger, type Logger } from '../../src/lib/logger.js';
import { PasswordHasher } from '../../src/lib/password.js';

/** 測試用虛構設定值（不是任何真實密碼）。 */
export const TEST_CONFIG: Config = {
  studentDefaultPassword: 'fake-default-pw',
  teacherAccount: 'teacher',
  teacherInitialPassword: 'fake-teacher-pw-01',
  sessionSecret: 'fake-session-secret-for-tests-only-abcdefghij',
  sessionIdleTimeout: 120 * 60_000,
  databasePath: ':memory:',
  port: 0,
  nodeEnv: 'test',
  clientOrigin: 'http://localhost:5173',
  enableDevTools: false,
};

/** 測試用較低成本的 scrypt 參數；併發測試（T079）另以正式參數執行。 */
export const fastHasher = () => new PasswordHasher({ N: 1024, r: 8, p: 1 });

export interface TestAppOptions {
  clock?: FakeClock;
  hasher?: PasswordHasher;
  logger?: Logger;
  config?: Partial<Config>;
}

export async function createTestApp(options: TestAppOptions = {}) {
  const clock = options.clock ?? createFakeClock();
  const config = { ...TEST_CONFIG, ...options.config };
  const db = openDatabase(':memory:');
  migrate(db, clock.now());
  const { app, container } = createApp({
    config,
    db,
    clock,
    hasher: options.hasher ?? fastHasher(),
    logger: options.logger ?? createLogger({ silent: true }),
  });
  await container.services.accounts.seedTeacher();
  return {
    app,
    container,
    clock,
    config,
    db,
    /** 新的 cookie agent（代表一個瀏覽器／裝置） */
    agent: () => request.agent(app),
    request: () => request(app),
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export async function loginAs(
  agent: ReturnType<typeof request.agent>,
  account: string,
  password: string,
) {
  const res = await agent.post('/api/auth/login').send({ account, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${account}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res;
}

export async function loginTeacher(t: TestApp) {
  const agent = t.agent();
  await loginAs(agent, t.config.teacherAccount, t.config.teacherInitialPassword);
  return agent;
}

/** 直接在資料庫建立學生（預設密碼、未分配）。 */
export async function seedStudent(t: TestApp, studentId: string, name = `測試${studentId}`) {
  const hash = await t.container.hasher.hash(t.config.studentDefaultPassword);
  return t.container.repos.users.createStudent(studentId.toUpperCase(), name, hash);
}

export async function loginStudent(t: TestApp, studentId: string) {
  const agent = t.agent();
  await loginAs(agent, studentId, t.config.studentDefaultPassword);
  return agent;
}

export function setGroupCount(t: TestApp, n: number) {
  t.container.repos.groupSettings.setGroupCount(n, t.clock.now());
}
