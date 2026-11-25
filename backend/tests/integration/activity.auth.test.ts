import { io } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { startActivityServer, type ActivityTestServer } from '../helpers/activity';

let t: ActivityTestServer;
afterEach(async () => {
  await t?.stop();
});

const ENDPOINTS: Array<[string, string, object?]> = [
  ['get', '/api/teacher/activity'],
  ['post', '/api/teacher/activity/start'],
  ['post', '/api/teacher/activity/open', { questionId: 'x', seconds: 60 }],
  ['post', '/api/teacher/activity/reopen', { questionId: 'x', seconds: 60, confirm: true }],
  ['post', '/api/teacher/activity/close'],
  ['post', '/api/teacher/activity/back-to-waiting'],
  ['post', '/api/teacher/activity/end'],
  ['get', '/api/teacher/activity/questions/x/result'],
];

describe('老師活動功能的權限（004 US1-7、FR-027）', () => {
  it.each(ENDPOINTS)('學生呼叫 %s %s 回 403，狀態不變', async (method, path, body) => {
    t = await startActivityServer();
    const student = await t.loginAs('S201');
    const req = method === 'get' ? t.http.get(path) : t.http.post(path).send(body ?? {});
    const res = await req.set('Cookie', student);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: '權限不足',
      hint: '此功能僅限老師使用',
    });
    expect((await t.api.get()).body.phase).toBe('NONE');
  });

  it.each(ENDPOINTS)('未登入呼叫 %s %s 回 401', async (method, path, body) => {
    t = await startActivityServer();
    const res = method === 'get' ? await t.http.get(path) : await t.http.post(path).send(body ?? {});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('學生 socket 無法連線 /teacher（FORBIDDEN）；未登入為 UNAUTHORIZED', async () => {
    t = await startActivityServer();
    const tryConnect = (cookie?: string) =>
      new Promise<{ message: string; data?: { code: string; message: string } }>((resolve, reject) => {
        const socket = io(`${t.url}/teacher`, {
          extraHeaders: cookie ? { Cookie: cookie } : {},
          transports: ['websocket'],
          forceNew: true,
          reconnection: false,
        });
        socket.on('connect', () => {
          socket.disconnect();
          reject(new Error('不應連線成功'));
        });
        socket.on('connect_error', (err) => {
          socket.disconnect();
          resolve(err as unknown as { message: string; data?: { code: string; message: string } });
        });
      });
    const asStudent = await tryConnect(await t.loginAs('S201'));
    expect(asStudent.data).toMatchObject({ code: 'FORBIDDEN', message: '權限不足' });
    const anonymous = await tryConnect();
    expect(anonymous.data?.code).toBe('UNAUTHORIZED');
  });

  it('老師 socket 連線後立即收到 teacher:update', async () => {
    t = await startActivityServer();
    const teacher = await t.connectTeacher();
    const view = await teacher.waitFor(() => true, 1000);
    expect(view.phase).toBe('NONE');
  });
});
