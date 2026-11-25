import { afterEach, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;
afterEach(async () => {
  await t.stop();
});

describe('作答中的他組資料隔離（Q-T11、FR-015、SC-004）', () => {
  it('B 送出後，A 的推播與 GET /state 都不含 B 的任何資料；B 的另一個連線收到本組送出', async () => {
    t = await startTestServer();
    const tokenA = await t.loginAs('S101');
    const tokenB = await t.loginAs('S201');
    const a = await t.connect(tokenA);
    const b = await t.connect(tokenB);

    await t.teacher.open('Q1', 60);
    await a.waitFor((v) => v.phase === 'ANSWERING');
    const bGotIt = b.waitFor((v) => v.myTeamSubmission?.answer === 'B組秘密答案');
    expect((await t.submit(tokenB, 'Q1', 'B組秘密答案')).status).toBe(201);
    await bGotIt;

    // 再讓 A 送出，確保 A 的連線一定有收到之後的推播
    const aGotOwn = a.waitFor((v) => v.myTeamSubmission?.answer === 'A組答案');
    await t.submit(tokenA, 'Q1', 'A組答案');
    await aGotOwn;

    const aState = await t.state(tokenA);
    const everythingA = JSON.stringify([...a.states, aState]);
    for (const leak of ['B組秘密答案', 'T2', '第 2 組', 'S201', 'rank', 'results']) {
      expect(everythingA).not.toContain(leak);
    }
    expect(aState.myTeamSubmission).toMatchObject({ answer: 'A組答案' });
  });

  it('連線成功時立即收到目前的 state:update', async () => {
    t = await startTestServer();
    await t.teacher.open('Q1', 60);
    const token = await t.loginAs('S301');
    const c = await t.connect(token);
    const first = c.states[0] ?? (await c.waitFor(() => true));
    expect(first).toMatchObject({ phase: 'ANSWERING', myTeam: { teamId: 'T3' }, myTeamSubmission: null });
  });
});
