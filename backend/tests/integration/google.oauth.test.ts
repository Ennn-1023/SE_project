/** US1：連結／中斷 Google 帳號（diagrams/003-sequence-connect.puml）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
import {
  connectGoogle,
  createTestApp,
  loginStudent,
  loginTeacher,
  seedStudent,
  type TestApp,
} from '../helpers/testApp.js';

let google: FakeGoogle;
let t: TestApp;

beforeEach(async () => {
  google = new FakeGoogle();
  t = await createTestApp({ google });
});

const resultOf = (res: { status: number; headers: Record<string, string> }) => {
  expect(res.status).toBe(302);
  const loc = new URL(res.headers.location!, 'http://x');
  expect(loc.pathname).toBe('/teacher/questions');
  return loc.searchParams.get('google');
};

const connections = () =>
  t.db.prepare('SELECT * FROM google_connections').all() as Record<string, unknown>[];

describe('Google 串接未設定', () => {
  it('status 回 configured:false；start 回 503 GOOGLE_NOT_CONFIGURED（邊界）', async () => {
    const plain = await createTestApp();
    const agent = await loginTeacher(plain);
    const status = await agent.get('/api/google/status');
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ configured: false, connected: false });
    const start = await agent.post('/api/google/oauth/start');
    expect(start.status).toBe(503);
    expect(start.body.error.code).toBe('GOOGLE_NOT_CONFIGURED');
    expect(start.body.error.message).toBe('系統尚未設定 Google 試算表串接');
  });
});

describe('連結 Google 帳號（FR-001～FR-003）', () => {
  it('start 回傳授權網址並建立 state；同意後 302 connected，token 加密保存（正常）', async () => {
    const agent = await loginTeacher(t);
    expect((await agent.get('/api/google/status')).body).toEqual({
      configured: true,
      connected: false,
    });
    const res = await connectGoogle(google, agent);
    expect(resultOf(res)).toBe('connected');
    const status = await agent.get('/api/google/status');
    expect(status.body).toEqual({
      configured: true,
      connected: true,
      googleEmail: 'teacher.fake@example.edu',
    });
    const [row] = connections();
    expect(row!.google_email).toBe('teacher.fake@example.edu');
    expect(String(row!.refresh_token_enc)).not.toContain('fake-refresh');
    expect(String(row!.scopes)).toContain('https://www.googleapis.com/auth/spreadsheets');
    const events = t.db.prepare('SELECT type FROM question_events').all();
    expect(events).toEqual([{ type: 'GOOGLE_CONNECTED' }]);
  });

  it('老師在 Google 頁面取消 → denied，不保存（邊界）', async () => {
    const agent = await loginTeacher(t);
    expect(resultOf(await connectGoogle(google, agent, { deny: true }))).toBe('denied');
    expect(connections()).toHaveLength(0);
  });

  it('未同意試算表權限 → scope_missing，不保存並撤銷剛取得的 token（邊界）', async () => {
    google.grantedScope = 'openid email';
    const agent = await loginTeacher(t);
    expect(resultOf(await connectGoogle(google, agent))).toBe('scope_missing');
    expect(connections()).toHaveLength(0);
    expect(google.revoked).toHaveLength(1);
  });

  it('授權碼交換失敗 → error', async () => {
    google.failExchange = true;
    const agent = await loginTeacher(t);
    expect(resultOf(await connectGoogle(google, agent))).toBe('error');
    expect(connections()).toHaveLength(0);
  });

  it('state 不存在、重複使用、過期、或由不同 session 回呼 → state_invalid（邊界）', async () => {
    const agent = await loginTeacher(t);
    // 不存在
    expect(
      resultOf(await agent.get('/api/google/oauth/callback').query({ state: 'nope', code: 'x' })),
    ).toBe('state_invalid');
    // 重複使用
    const start = await agent.post('/api/google/oauth/start');
    const q = google.consent(start.body.authUrl);
    expect(resultOf(await agent.get('/api/google/oauth/callback').query(q))).toBe('connected');
    expect(resultOf(await agent.get('/api/google/oauth/callback').query(q))).toBe('state_invalid');
    // 過期（10 分鐘）
    const start2 = await agent.post('/api/google/oauth/start');
    const q2 = google.consent(start2.body.authUrl);
    t.clock.advance(11 * 60_000);
    expect(resultOf(await agent.get('/api/google/oauth/callback').query(q2))).toBe('state_invalid');
    // 另一個 session（另一個瀏覽器）
    const start3 = await agent.post('/api/google/oauth/start');
    const q3 = google.consent(start3.body.authUrl);
    const other = await loginTeacher(t);
    expect(resultOf(await other.get('/api/google/oauth/callback').query(q3))).toBe('state_invalid');
    // 未登入
    const start4 = await agent.post('/api/google/oauth/start');
    const q4 = google.consent(start4.body.authUrl);
    expect(resultOf(await t.request().get('/api/google/oauth/callback').query(q4))).toBe(
      'state_invalid',
    );
  });

  it('回呼網址不含任何 token 或 Google 錯誤原文', async () => {
    const agent = await loginTeacher(t);
    const res = await connectGoogle(google, agent);
    expect(res.headers.location).toBe('/teacher/questions?google=connected');
  });
});

describe('中斷 Google 連結（FR-002）', () => {
  it('撤銷授權並刪除連結；未連結時亦回 204（正常）', async () => {
    const agent = await loginTeacher(t);
    await connectGoogle(google, agent);
    const res = await agent.delete('/api/google/connection');
    expect(res.status).toBe(204);
    expect(google.revoked).toHaveLength(1);
    expect(connections()).toHaveLength(0);
    expect((await agent.get('/api/google/status')).body.connected).toBe(false);
    expect((await agent.delete('/api/google/connection')).status).toBe(204);
    const types = t.db.prepare('SELECT type FROM question_events ORDER BY id').all();
    expect(types).toEqual([{ type: 'GOOGLE_CONNECTED' }, { type: 'GOOGLE_DISCONNECTED' }]);
  });

  it('Google 撤銷失敗仍完成中斷（只記 log）', async () => {
    const agent = await loginTeacher(t);
    await connectGoogle(google, agent);
    google.revokeFails = true;
    expect((await agent.delete('/api/google/connection')).status).toBe(204);
    expect(connections()).toHaveLength(0);
  });
});

describe('權限（FR-031）', () => {
  it('學生呼叫 status／start／disconnect 一律 403；未登入 401（邊界）', async () => {
    await seedStudent(t, 'S1110001');
    const student = await loginStudent(t, 'S1110001');
    for (const [method, url] of [
      ['get', '/api/google/status'],
      ['post', '/api/google/oauth/start'],
      ['delete', '/api/google/connection'],
    ] as const) {
      const res = await student[method](url);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect((await t.request()[method](url)).status).toBe(401);
    }
  });
});
