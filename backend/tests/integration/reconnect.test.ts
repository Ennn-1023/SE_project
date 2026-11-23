import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';
import { RECOVERY_TARGET_MS, SOCKET_RECONNECT_OPTIONS, type StudentView } from '@buzzer/shared';
import { startTestServer, type TestClient, type TestServer } from '../helpers/testServer';

let t: TestServer | null;
afterEach(async () => {
  await t?.stop();
  t = null;
});

/** 取得一個目前沒被使用的 port */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

describe('斷線後自動重連的時間（SC-006）', () => {
  it('伺服器中斷 4 秒後恢復，用前端相同的重連設定在 3 秒內收到正確的 state:update', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'buzzer-reconnect-'));
    const env = { DATABASE_PATH: join(dir, 'buzzer.db'), PORT: String(await freePort()) };
    try {
      t = await startTestServer(env);
      const token = await t.loginAs('S201');
      await t.teacher.open('Q1', 60);
      await t.submit(token, 'Q1', '斷線前送出');

      // 與 frontend/src/realtime/socket.ts 完全相同的重連設定
      const socket = io(`${t.url}/student`, { extraHeaders: { Cookie: token }, transports: ['websocket'], forceNew: true, ...SOCKET_RECONNECT_OPTIONS });
      await new Promise<void>((resolve) => socket.once('state:update', () => resolve()));

      const disconnected = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
      await t.stop();
      t = null;
      await disconnected;
      // 中斷 4 秒：舊設定（上限 5 秒）下一次重試會落在恢復後約 3.5 秒，超過 SC-006；
      // 新設定（上限 2 秒）約 1.5 秒內就會重試
      await new Promise((r) => setTimeout(r, 4000));

      // 伺服器在同一個 port 恢復（作答中重啟 → 回到 WAITING，FR-020a）
      t = await startTestServer(env);
      const recoveredAt = Date.now();
      const view = await new Promise<StudentView>((resolve) => socket.once('state:update', resolve));
      const elapsed = Date.now() - recoveredAt;
      socket.disconnect();

      expect(view.phase).toBe('WAITING');
      expect(elapsed).toBeLessThanOrEqual(RECOVERY_TARGET_MS);
    } finally {
      await t?.stop();
      t = null;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** 斷線後重新連線，回傳重連後收到的第一個 state:update */
async function reconnect(client: TestClient): Promise<StudentView> {
  const before = client.states.length;
  client.socket.disconnect();
  const next = new Promise<StudentView>((resolve) => {
    client.socket.once('state:update', (v: StudentView) => resolve(v));
  });
  client.socket.connect();
  const v = await next;
  expect(client.states.length).toBeGreaterThan(before);
  return v;
}

describe('重新整理與斷線重連（US4、Q-T15、FR-004）', () => {
  it('作答中本組已送出後重連：收到 ANSWERING 與本組送出，且不含他組資料', async () => {
    t = await startTestServer();
    const tokA = await t.loginAs('S101');
    const tokB = await t.loginAs('S201');
    const a = await t.connect(tokA);
    await t.teacher.open('Q1', 60);
    await t.submit(tokB, 'Q1', 'B組秘密');
    await t.submit(tokA, 'Q1', 'A組答案');

    const v = await reconnect(a);
    expect(v).toMatchObject({
      phase: 'ANSWERING',
      question: { questionId: 'Q1' },
      myTeamSubmission: { answer: 'A組答案' },
    });
    expect(typeof v.endsAt).toBe('string');
    expect(JSON.stringify(v)).not.toMatch(/B組秘密|T2|第 2 組/);
  });

  it('作答中本組未送出時重連：myTeamSubmission 為 null', async () => {
    t = await startTestServer();
    const c = await t.connect(await t.loginAs('S301'));
    await t.teacher.open('Q1', 60);
    const v = await reconnect(c);
    expect(v).toMatchObject({ phase: 'ANSWERING', myTeamSubmission: null });
  });

  it('斷線期間題目已結束，重連後收到 CLOSED 與完整結果', async () => {
    t = await startTestServer();
    const tokA = await t.loginAs('S101');
    const a = await t.connect(tokA);
    await t.teacher.open('Q1', 60);
    await t.submit(await t.loginAs('S201'), 'Q1', 'B 的答案');
    a.socket.disconnect();
    await t.teacher.close();

    const next = new Promise<StudentView>((resolve) => a.socket.once('state:update', resolve));
    a.socket.connect();
    const v = await next;
    expect(v).toMatchObject({
      phase: 'CLOSED',
      myTeamOutcome: 'NOT_SUBMITTED',
      results: [{ rank: 1, teamName: '第 2 組', answer: 'B 的答案', isWinner: true }],
    });
  });

  it('作答中晚加入的學生直接看到作答中畫面，並可以正常送出', async () => {
    t = await startTestServer();
    await t.teacher.open('Q1', 60);
    const tok = await t.loginAs('S401');
    const late = await t.connect(tok);
    const first = await late.waitFor(() => true);
    expect(first).toMatchObject({ phase: 'ANSWERING', question: { questionId: 'Q1' } });
    expect((await t.submit(tok, 'Q1', '晚到的答案')).status).toBe(201);
  });
});
