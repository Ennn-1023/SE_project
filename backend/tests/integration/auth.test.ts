import { beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_LOCK } from '../../src/domain/types.js';
import { createTestApp, loginAs, seedStudent, type TestApp } from '../helpers/testApp.js';

describe('POST /api/auth/login（US1、FR-017～FR-019）', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
    await seedStudent(t, 'B1103', '王小明');
  });

  const login = (account: unknown, password: unknown) =>
    t.request().post('/api/auth/login').send({ account, password });

  it('老師登入回 200、設定 sid cookie、角色 TEACHER（正常）', async () => {
    const res = await login(t.config.teacherAccount, t.config.teacherInitialPassword);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ account: 'TEACHER', role: 'TEACHER' });
    const cookie = res.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/^sid=[^;]+;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('學生以預設密碼登入回 200、角色 STUDENT、組別 null（正常）', async () => {
    const res = await login('B1103', t.config.studentDefaultPassword);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      account: 'B1103',
      displayName: '王小明',
      role: 'STUDENT',
      groupNumber: null,
    });
  });

  it('帳號前後空白與小寫仍可登入', async () => {
    const res = await login('  b1103 ', t.config.studentDefaultPassword);
    expect(res.status).toBe(200);
  });

  it('密碼前後多空白不會被修剪，登入失敗', async () => {
    const res = await login('B1103', ` ${t.config.studentDefaultPassword}`);
    expect(res.status).toBe(401);
  });

  it('錯誤密碼與不存在帳號回相同 401 訊息（FR-018）', async () => {
    const wrong = await login('B1103', 'not-the-password');
    const missing = await login('Z9999', 'not-the-password');
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
    expect(wrong.body.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: '帳號或密碼錯誤',
    });
  });

  it('空白欄位回 400 並指出欄位（邊界）', async () => {
    const noAccount = await login('   ', 'x');
    expect(noAccount.status).toBe(400);
    expect(noAccount.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'account' });
    expect(noAccount.body.error.hint).toBeTruthy();
    const noPassword = await login('B1103', '');
    expect(noPassword.body.error.field).toBe('password');
    const missingBody = await t.request().post('/api/auth/login').send({});
    expect(missingBody.status).toBe(400);
  });

  it('15 分鐘內第 5 次失敗回 423 並含 retryAfterSeconds；期間正確密碼也被拒（邊界）', async () => {
    for (let i = 1; i <= 4; i++) {
      const r = await login('B1103', 'wrong');
      expect(r.status).toBe(401);
      t.clock.advance(60_000);
    }
    const fifth = await login('B1103', 'wrong');
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(fifth.body.error.message).toBe('嘗試次數過多，請 15 分鐘後再試');
    expect(fifth.body.error.details.retryAfterSeconds).toBe(15 * 60);

    t.clock.advance(3 * 60_000);
    const locked = await login('B1103', t.config.studentDefaultPassword);
    expect(locked.status).toBe(423);
    expect(locked.body.error.details.retryAfterSeconds).toBe(12 * 60);
    expect(locked.body.error.message).toBe('嘗試次數過多，請 12 分鐘後再試');

    const row = t.container.repos.users.findByAccount('B1103')!;
    expect(row.failedLoginCount).toBe(5);
    expect(row.lockedUntil).not.toBeNull();
  });

  it('鎖定期滿後可再登入，且失敗計數歸零', async () => {
    for (let i = 0; i < LOGIN_LOCK.maxFailures; i++) await login('B1103', 'wrong');
    t.clock.advance(LOGIN_LOCK.lockMs);
    const res = await login('B1103', t.config.studentDefaultPassword);
    expect(res.status).toBe(200);
    const row = t.container.repos.users.findByAccount('B1103')!;
    expect(row.failedLoginCount).toBe(0);
    expect(row.failedWindowStartedAt).toBeNull();
    expect(row.lockedUntil).toBeNull();
  });

  it('視窗過期後失敗重新計數（data-model 狀態轉換）', async () => {
    for (let i = 0; i < 4; i++) await login('B1103', 'wrong');
    t.clock.advance(LOGIN_LOCK.windowMs);
    const res = await login('B1103', 'wrong');
    expect(res.status).toBe(401);
    const row = t.container.repos.users.findByAccount('B1103')!;
    expect(row.failedLoginCount).toBe(1);
    expect(row.failedWindowStartedAt!.toISOString()).toBe(t.clock.now().toISOString());
  });

  it('成功登入會清除先前的失敗計數', async () => {
    await login('B1103', 'wrong');
    await login('B1103', 'wrong');
    await login('B1103', t.config.studentDefaultPassword);
    expect(t.container.repos.users.findByAccount('B1103')!.failedLoginCount).toBe(0);
  });
});

describe('GET /api/auth/me', () => {
  it('登入後回目前使用者；未登入回 401 UNAUTHENTICATED', async () => {
    const t = await createTestApp();
    const agent = t.agent();
    const anon = await agent.get('/api/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    await loginAs(agent, t.config.teacherAccount, t.config.teacherInitialPassword);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toEqual({ account: 'TEACHER', displayName: '老師', role: 'TEACHER' });
  });

  it('production 環境的 cookie 帶 Secure', async () => {
    const t = await createTestApp({ config: { nodeEnv: 'production' } });
    const res = await t
      .request()
      .post('/api/auth/login')
      .send({ account: t.config.teacherAccount, password: t.config.teacherInitialPassword });
    expect(res.headers['set-cookie']![0]).toMatch(/Secure/i);
  });
});
