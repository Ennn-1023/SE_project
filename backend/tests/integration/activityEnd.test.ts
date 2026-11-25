import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;
beforeEach(async () => {
  t = await startTestServer();
});
afterEach(async () => {
  await t.stop();
});

const ENDED_ERROR = { code: 'ACTIVITY_ENDED', field: null, message: '活動已結束', hint: '感謝參與' };

describe('活動結束（US5）', () => {
  it.each([
    ['WAITING', async () => {}],
    ['ANSWERING', async () => void (await t.teacher.open('Q1', 60))],
    [
      'CLOSED',
      async () => {
        await t.teacher.open('Q1', 60);
        await t.teacher.close();
      },
    ],
  ])('%s 時結束活動，所有學生都收到 ENDED', async (_phase, setup) => {
    const a = await t.connect(await t.loginAs('S101'));
    const n = await t.connect(await t.loginAs('S900'));
    await setup();
    expect((await t.teacher.end()).status).toBe(200);
    await a.waitFor((v) => v.phase === 'ENDED');
    await n.waitFor((v) => v.phase === 'ENDED');
  });

  it('作答中結束活動：先產生該題結果（closed_reason=ACTIVITY_ENDED），只推播一次 ENDED', async () => {
    const tok = await t.loginAs('S201');
    const c = await t.connect(tok);
    await t.teacher.open('Q1', 60);
    await t.submit(tok, 'Q1', 'B 的答案');
    await t.teacher.end();
    await c.waitFor((v) => v.phase === 'ENDED');

    const results = (await t.http.get('/api/dev/results').set('Cookie', t.teacherCookie)).body;
    expect(results).toEqual([expect.objectContaining({ question_id: 'Q1', winner_team: 'T2' })]);
    const reason = t.server.ctx.repo.getResult('A1', 'Q1')?.closedReason;
    expect(reason).toBe('ACTIVITY_ENDED');
    // 不會先推播 CLOSED 再推播 ENDED
    expect(c.states.some((v) => v.phase === 'CLOSED')).toBe(false);
  });

  it('結束後送出回 409 ACTIVITY_ENDED（含原本開放的題目）', async () => {
    const tok = await t.loginAs('S201');
    await t.teacher.open('Q1', 60);
    await t.teacher.end();
    for (const q of ['Q1', 'Q2']) {
      const res = await t.submit(tok, q, '答案');
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual(ENDED_ERROR);
    }
  });

  it('結束後 GET /state 回 ENDED，且不含題目或結果', async () => {
    const tok = await t.loginAs('S201');
    await t.teacher.end();
    const view = await t.state(tok);
    expect(view.phase).toBe('ENDED');
    expect(view.question).toBeUndefined();
    expect(view.results).toBeUndefined();
  });

  it('ENDED 之後再結束為無變化（004 FR-014），其他操作仍回 409 ACTIVITY_ENDED', async () => {
    await t.teacher.end();
    const res = await t.teacher.end();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phase: 'ENDED' });
    const open = await t.teacher.open('Q2', 60);
    expect(open.status).toBe(409);
    expect(open.body.error).toEqual(ENDED_ERROR);
  });
});
