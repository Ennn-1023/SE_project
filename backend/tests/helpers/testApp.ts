import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { Config } from '../../src/config/env.js';
import { migrate } from '../../src/db/migrations.js';
import { createFakeClock, type FakeClock } from '../../src/lib/clock.js';
import { openDatabase } from '../../src/lib/db.js';
import { createLogger, type Logger } from '../../src/lib/logger.js';
import { PasswordHasher } from '../../src/lib/password.js';
import type { FakeGoogle } from './fakeGoogle.js';

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
  google: null,
};

/** 測試用較低成本的 scrypt 參數；併發測試（T079）另以正式參數執行。 */
export const fastHasher = () => new PasswordHasher({ N: 1024, r: 8, p: 1 });

/** 測試用虛構的 Google 設定（不是任何真實憑證）。 */
export const TEST_GOOGLE_CONFIG = {
  clientId: 'fake-client.apps.googleusercontent.com',
  clientSecret: 'fake-google-client-secret',
  encryptionKey: Buffer.alloc(32, 5),
  redirectUri: 'http://localhost:5173/api/google/oauth/callback',
};

export interface TestAppOptions {
  clock?: FakeClock;
  hasher?: PasswordHasher;
  logger?: Logger;
  config?: Partial<Config>;
  /** 注入 FakeGoogle 並啟用 Google 設定（003） */
  google?: FakeGoogle;
}

export async function createTestApp(options: TestAppOptions = {}) {
  const clock = options.clock ?? createFakeClock();
  const config: Config = {
    ...TEST_CONFIG,
    ...(options.google ? { google: TEST_GOOGLE_CONFIG } : {}),
    ...options.config,
  };
  const db = openDatabase(':memory:');
  migrate(db, clock.now());
  const { app, container } = createApp({
    config,
    db,
    clock,
    hasher: options.hasher ?? fastHasher(),
    logger: options.logger ?? createLogger({ silent: true }),
    google: options.google ? { oauth: options.google, sheets: options.google } : undefined,
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

/**
 * 以老師身分走完 Google 授權（start → FakeGoogle 同意 → 回呼），回傳回呼的 302 回應。
 */
export async function connectGoogle(
  google: FakeGoogle,
  agent: ReturnType<typeof request.agent>,
  options: { deny?: boolean } = {},
) {
  const start = await agent.post('/api/google/oauth/start');
  if (start.status !== 200) throw new Error(`start failed: ${start.status}`);
  const query = google.consent(start.body.authUrl, options);
  return agent.get('/api/google/oauth/callback').query(query);
}

export function setGroupCount(t: TestApp, n: number) {
  t.container.repos.groupSettings.setGroupCount(n, t.clock.now());
}
