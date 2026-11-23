import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;
beforeEach(async () => {
  t = await startTestServer();
});
afterEach(async () => {
  await t.stop();
});

const CLOSED_ERROR = {
  code: 'QUESTION_CLOSED',
  field: null,
  message: '本題搶答已結束，無法再送出答案',
  hint: '請查看本題結果',
};

describe('結束後送出被拒（US3、Q-T7、FR-011）', () => {
  it('時間到後送出回 409 QUESTION_CLOSED，結果不受影響', async () => {
    const tokB = await t.loginAs('S201');
    const tokA = await t.loginAs('S101');
    await t.teacher.open('Q1', 60);
    await t.submit(tokB, 'Q1', 'B 的答案');
    await t.teacher.timeUp();

    const res = await t.submit(tokA, 'Q1', '太晚了');
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual(CLOSED_ERROR);

    const subs = await t.http.get('/api/dev/submissions').set('Cookie', t.teacherCookie).query({ questionId: 'Q1' });
    expect(subs.body).toHaveLength(1);
    const results = await t.http.get('/api/dev/results').set('Cookie', t.teacherCookie);
    expect(results.body).toHaveLength(1);
    expect(results.body[0].winner_team).toBe('T2');
  });

  it('手動結束後送出回 409 QUESTION_CLOSED（含本組尚未送出的組別）', async () => {
    const tok = await t.loginAs('S301');
    await t.teacher.open('Q1', 60);
    await t.teacher.close();
    const res = await t.submit(tok, 'Q1', '畫面還沒更新');
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual(CLOSED_ERROR);
  });

  it('已結束時送出「其他題目」回 QUESTION_NOT_OPEN', async () => {
    const tok = await t.loginAs('S301');
    await t.teacher.open('Q1', 60);
    await t.teacher.close();
    const res = await t.submit(tok, 'Q2', '答案');
    expect(res.body.error.code).toBe('QUESTION_NOT_OPEN');
  });

  it('WAITING 時送出回 409 QUESTION_NOT_OPEN', async () => {
    const tok = await t.loginAs('S301');
    await t.teacher.open('Q1', 60);
    await t.teacher.close();
    await t.teacher.next();
    const res = await t.submit(tok, 'Q1', '答案');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'QUESTION_NOT_OPEN', message: '此題目目前未開放作答' });
  });

  it('倒數自然歸零後送出也被拒（伺服器計時器）', async () => {
    const tok = await t.loginAs('S301');
    await t.teacher.open('Q1', 5);
    // 直接把伺服器端的結束時間提前：呼叫狀態機的 closeQuestion 模擬計時器觸發
    t.server.ctx.machine.closeQuestion('TIME_UP');
    const res = await t.submit(tok, 'Q1', '答案');
    expect(res.body.error.code).toBe('QUESTION_CLOSED');
    const results = await t.http.get('/api/dev/results').set('Cookie', t.teacherCookie);
    expect(results.body[0]).toMatchObject({ question_id: 'Q1', winner_team: null });
  });
});
