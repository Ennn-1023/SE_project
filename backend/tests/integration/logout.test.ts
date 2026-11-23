import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, loginStudent, seedStudent, type TestApp } from '../helpers/testApp.js';

const TWO_HOURS = 2 * 60 * 60_000;

describe('登出與閒置逾時（US2、FR-022、FR-023）', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
    await seedStudent(t, 'S0001', '甲');
  });

  it('登出回 204、清除 cookie，同一 cookie 再呼叫 /api/auth/me 回 401（正常）', async () => {
    const login = await t
      .request()
      .post('/api/auth/login')
      .send({ account: 'S0001', password: t.config.studentDefaultPassword });
    const loginCookie = String(login.headers['set-cookie'][0]).split(';')[0];
    expect((await t.request().get('/api/auth/me').set('Cookie', loginCookie)).status).toBe(200);
    const res = await t.request().post('/api/auth/logout').set('Cookie', loginCookie);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'][0]).toMatch(/^sid=;/);
    // 以登出前的 cookie 重放，確認伺服器端已撤銷
    const replay = await t.request().get('/api/auth/me').set('Cookie', loginCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('未登入時登出回 401', async () => {
    const res = await t.request().post('/api/auth/logout');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('閒置 2 小時減 1 秒仍有效；達 2 小時回 401（邊界）', async () => {
    const agent = await loginStudent(t, 'S0001');
    t.clock.advance(TWO_HOURS - 1000);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    t.clock.advance(TWO_HOURS);
    const expired = await agent.get('/api/auth/me');
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('每次操作都會延長閒置期限', async () => {
    const agent = await loginStudent(t, 'S0001');
    for (let i = 0; i < 3; i++) {
      t.clock.advance(TWO_HOURS - 60_000);
      expect((await agent.get('/api/auth/me')).status).toBe(200);
    }
  });

  it('同一學生兩台裝置登入，其中一台登出不影響另一台', async () => {
    const phone = await loginStudent(t, 'S0001');
    const laptop = await loginStudent(t, 'S0001');
    expect((await phone.post('/api/auth/logout')).status).toBe(204);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
    expect((await laptop.get('/api/auth/me')).status).toBe(200);
  });

  it('偽造的 sid cookie 回 401', async () => {
    const res = await t.request().get('/api/auth/me').set('Cookie', 'sid=forged-token-value');
    expect(res.status).toBe(401);
  });
});
