import { afterEach, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;

afterEach(async () => {
  await t?.stop();
});

describe('搶答的身分驗證（整合 001 F1 登入；002 Q-T10）', () => {
  it('學生以 001 帳號登入後可取回搶答狀態，組別來自 001 的組別指派', async () => {
    t = await startTestServer();
    const cookie = await t.loginAs('S201');
    const view = await t.state(cookie);
    expect(view).toMatchObject({ phase: 'WAITING', myTeam: { teamId: 'T2', name: '第 2 組' } });
  });

  it('沒有登入時 REST 回 401 與統一錯誤格式', async () => {
    t = await startTestServer();
    const res = await t.http.get('/api/student/state');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHENTICATED', message: '請先登入' });
    expect(res.body.error.hint).toBeTruthy();
  });

  it('偽造、已登出的 session 都回 401', async () => {
    t = await startTestServer();
    const forged = 'sid=' + 'a'.repeat(64);
    expect((await t.http.get('/api/student/state').set('Cookie', forged)).status).toBe(401);

    const cookie = await t.loginAs('S201');
    expect((await t.http.post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await t.http.get('/api/student/state').set('Cookie', cookie)).status).toBe(401);
  });

  it('老師不能使用學生搶答 API；學生不能使用模擬老師 API（403）', async () => {
    t = await startTestServer();
    const teacher = await t.teacher.cookie();
    const asTeacher = await t.http.get('/api/student/state').set('Cookie', teacher);
    expect(asTeacher.status).toBe(403);
    expect(asTeacher.body.error.code).toBe('FORBIDDEN');

    const student = await t.loginAs('S201');
    const asStudent = await t.http
      .post('/api/dev/teacher/open')
      .set('Cookie', student)
      .send({ questionId: 'Q1' });
    expect(asStudent.status).toBe(403);
    expect(asStudent.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: '此功能僅限老師使用',
    });
  });

  it('socket 沒有合法 session 時收到 connect_error UNAUTHORIZED', async () => {
    t = await startTestServer();
    for (const cookie of ['sid=not-a-session', 'other=1']) {
      const err = await t.connect(cookie).then(
        () => null,
        (e: Error & { data?: { code: string } }) => e,
      );
      expect(err?.message).toBe('UNAUTHORIZED');
      expect(err?.data?.code).toBe('UNAUTHORIZED');
    }
  });

  it('老師的 session 不能連上學生 socket', async () => {
    t = await startTestServer();
    const err = await t.connect(await t.teacher.cookie()).then(
      () => null,
      (e: Error) => e,
    );
    expect(err?.message).toBe('UNAUTHORIZED');
  });

  it('不合法的 JSON 回 400', async () => {
    t = await startTestServer();
    const res = await t.http
      .post('/api/student/submissions')
      .set('Cookie', await t.loginAs('S201'))
      .set('Content-Type', 'application/json')
      .send('{"questionId":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ENABLE_DEV_TOOLS=false 時 /api/dev/* 回 404 NOT_FOUND（與一般不存在的路徑相同）', async () => {
    t = await startTestServer({ ENABLE_DEV_TOOLS: 'false' });
    const teacher = await t.teacher.cookie();
    const responses = [
      await t.http.post('/api/dev/teacher/open').set('Cookie', teacher).send({ questionId: 'Q1' }),
      await t.http.get('/api/dev/teacher/status').set('Cookie', teacher),
      await t.http.get('/api/dev/results').set('Cookie', teacher),
      await t.http.get('/api/no-such-path'),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(responses[3]!.body);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('瀏覽器預設的 HTTP long-polling 傳輸也能連線（不會被 Express 回 404）', async () => {
    t = await startTestServer();
    const { io } = await import('socket.io-client');
    const cookie = await t.loginAs('S201');
    const socket = io(`${t.url}/student`, {
      extraHeaders: { Cookie: cookie },
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
    expect(view.question).toMatchObject({
      questionId: 'Q1',
      number: 1,
      text: '請說明 TCP 三向交握的三個步驟。',
    });
    expect(typeof view.endsAt).toBe('string');
    expect(typeof view.serverNow).toBe('string');
  });

  it('連線後老師改變學生組別，下一次推播即依新組別產生視角', async () => {
    t = await startTestServer();
    const client = await t.connect(await t.loginAs('S900'));
    expect((await client.waitFor(() => true)).myTeam).toBeNull();
    t.server.container.services.groups.assign('S900', 3);
    const waiting = client.waitFor((v) => v.phase === 'ANSWERING');
    await t.teacher.open('Q1', 60);
    expect((await waiting).myTeam).toEqual({ teamId: 'T3', name: '第 3 組' });
  });
});
