import { afterEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;

afterEach(async () => {
  await t?.stop();
});

describe('身分驗證（Q-T10）', () => {
  it('dev 登入成功並可以取回狀態', async () => {
    t = await startTestServer();
    const token = await t.loginAs('S201');
    const view = await t.state(token);
    expect(view).toMatchObject({ phase: 'WAITING', myTeam: { teamId: 'T2', name: '第 2 組' } });
  });

  it('沒有 token 時 REST 回 401 與統一錯誤格式', async () => {
    t = await startTestServer();
    const res = await t.http.get('/api/student/state');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', field: null, message: '尚未登入或登入已過期', hint: '請重新登入' },
    });
  });

  it('偽造或過期的 token 回 401', async () => {
    t = await startTestServer();
    const forged = jwt.sign({}, 'another-secret'.padEnd(40, 'y'), { subject: 'S201' });
    const expired = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 10 }, 'test-secret-'.padEnd(48, 'x'), {
      subject: 'S201',
    });
    for (const token of [forged, expired, 'not-a-jwt']) {
      const res = await t.http.get('/api/student/state').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('socket 沒有合法 token 時收到 connect_error UNAUTHORIZED', async () => {
    t = await startTestServer();
    const err = await t.connect('bad-token').then(
      () => null,
      (e: Error & { data?: { code: string } }) => e,
    );
    expect(err?.message).toBe('UNAUTHORIZED');
    expect(err?.data?.code).toBe('UNAUTHORIZED');
  });

  it('dev 登入時學號不存在或缺少回 400 VALIDATION_ERROR（field studentId）', async () => {
    t = await startTestServer();
    const notFound = await t.http.post('/api/dev/login').send({ studentId: 'S999' });
    expect(notFound.status).toBe(400);
    expect(notFound.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'studentId', message: '找不到此學號' });
    const missing = await t.http.post('/api/dev/login').send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'studentId' });
  });

  it('不合法的 JSON 回 400', async () => {
    t = await startTestServer();
    const res = await t.http
      .post('/api/dev/login')
      .set('Content-Type', 'application/json')
      .send('{"studentId":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ENABLE_DEV_TOOLS=false 時 /api/dev/* 回 404 NOT_FOUND（與一般不存在的路徑相同）', async () => {
    t = await startTestServer({ ENABLE_DEV_TOOLS: 'false' });
    const notFound = {
      error: { code: 'NOT_FOUND', field: null, message: '找不到此路徑', hint: '請確認網址是否正確' },
    };
    for (const res of [
      await t.http.post('/api/dev/login').send({ studentId: 'S201' }),
      await t.http.post('/api/dev/teacher/open').send({ questionId: 'Q1' }),
      await t.http.get('/api/dev/teacher/status'),
      await t.http.get('/api/no-such-path'),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(notFound);
    }
  });

  it('瀏覽器預設的 HTTP long-polling 傳輸也能連線（不會被 Express 回 404）', async () => {
    t = await startTestServer();
    const { io } = await import('socket.io-client');
    const token = await t.loginAs('S201');
    const socket = io(`${t.url}/student`, {
      auth: { token },
      transports: ['polling'],
      forceNew: true,
      reconnection: false,
    });
    try {
      const view = await new Promise<{ phase: string }>((resolve, reject) => {
        socket.once('state:update', resolve);
        socket.once('connect_error', reject);
      });
      expect(view.phase).toBe('WAITING');
    } finally {
      socket.disconnect();
    }
  });

  it('模擬老師開放題目後，學生 socket 收到 ANSWERING 推播', async () => {
    t = await startTestServer();
    const client = await t.connect(await t.loginAs('S201'));
    const waiting = client.waitFor((v) => v.phase === 'ANSWERING');
    expect((await t.teacher.open('Q1', 60)).status).toBe(200);
    const view = await waiting;
    expect(view.question).toEqual({ questionId: 'Q1', number: 1, text: '請說明 TCP 三向交握的三個步驟。' });
    expect(typeof view.endsAt).toBe('string');
    expect(typeof view.serverNow).toBe('string');
  });
});
