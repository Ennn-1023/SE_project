import { afterEach, describe, expect, it } from 'vitest';
import { startActivityServer, type ActivityTestServer } from '../helpers/activity';

let t: ActivityTestServer;
let id: string;
afterEach(async () => {
  await t?.stop();
});

async function setup(n: number) {
  t = await startActivityServer();
  id = await t.startActivity();
  await t.api.open(`${id}-${n}`, 60);
}

describe('題組作答：每小題一個答案、一次送出（004 FR-030a、FR-030b、SC-010）', () => {
  it('正常送出：回應與學生畫面依小題分列；結束後寫入 submission_parts 與 result_parts', async () => {
    await setup(2);
    const cookie = await t.loginAs('S201');
    const tab = await t.connect(cookie);
    const res = await t.submitAnswers(cookie, `${id}-2`, [' 甲 ', '乙']);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      questionId: `${id}-2`,
      teamId: 'T2',
      answer: '（1）甲\n（2）乙',
      answers: [
        { partIndex: 0, partLabel: '（1）', answer: '甲' },
        { partIndex: 1, partLabel: '（2）', answer: '乙' },
      ],
    });
    const mine = await tab.waitFor((v) => v.myTeamSubmission != null);
    expect(mine.myTeamSubmission?.answers).toHaveLength(2);

    await t.api.close();
    expect(
      t.db
        .prepare(`SELECT part_index, answer FROM submission_parts WHERE question_id = ? ORDER BY part_index`)
        .all(`${id}-2`),
    ).toEqual([
      { part_index: 0, answer: '甲' },
      { part_index: 1, answer: '乙' },
    ]);
    expect(t.server.ctx.repo.getResult(id, `${id}-2`)?.answers.map((a) => a.answer)).toEqual(['甲', '乙']);
    const closed = await tab.waitFor((v) => v.phase === 'CLOSED');
    expect(closed.results?.[0]?.answers).toEqual([
      { partIndex: 0, partLabel: '（1）', answer: '甲' },
      { partIndex: 1, partLabel: '（2）', answer: '乙' },
    ]);
  });

  it('答案數量與小題數不符 → 400 PART_COUNT_MISMATCH', async () => {
    await setup(2);
    const res = await t.submitAnswers(await t.loginAs('S201'), `${id}-2`, ['只有一個']);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'PART_COUNT_MISMATCH',
      field: 'answers',
      message: '答案數量（1）與小題數（2）不符',
      hint: '請重新整理頁面後再作答',
    });
  });

  it('第（2）小題空白 → 400 PART_ANSWER_EMPTY 指出小題，修正後仍可送出（submission_parts.answer）', async () => {
    await setup(2);
    const cookie = await t.loginAs('S201');
    const res = await t.submitAnswers(cookie, `${id}-2`, ['甲', '   ']);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'PART_ANSWER_EMPTY',
      field: 'answers[1]',
      message: '第（2）小題答案不可為空',
      hint: '請輸入內容後再送出',
    });
    expect((await t.submitAnswers(cookie, `${id}-2`, ['甲', '乙'])).status).toBe(201);
  });

  it('某小題 501 字 → 400 PART_ANSWER_TOO_LONG；剛好 500 字可送出', async () => {
    await setup(2);
    const cookie = await t.loginAs('S201');
    const tooLong = await t.submitAnswers(cookie, `${id}-2`, ['甲', 'a'.repeat(501)]);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toMatchObject({
      code: 'PART_ANSWER_TOO_LONG',
      field: 'answers[1]',
      message: '第（2）小題答案最多 500 字，目前 501 字',
    });
    expect((await t.submitAnswers(cookie, `${id}-2`, ['a'.repeat(500), '乙'])).status).toBe(201);
  });

  it('單題仍接受 002 的 answer 格式，也接受 answers 陣列', async () => {
    await setup(1);
    expect((await t.submit(await t.loginAs('S201'), `${id}-1`, '舊格式')).status).toBe(201);
    expect((await t.submitAnswers(await t.loginAs('S301'), `${id}-1`, ['新格式'])).status).toBe(201);
    const empty = await t.submitAnswers(await t.loginAs('S401'), `${id}-1`, ['  ']);
    expect(empty.body.error).toMatchObject({ code: 'EMPTY_ANSWER', field: 'answer' });
  });

  it('缺少答案 → 400 VALIDATION_ERROR', async () => {
    await setup(1);
    const res = await t.http
      .post('/api/student/submissions')
      .set('Cookie', await t.loginAs('S201'))
      .send({ questionId: `${id}-1` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
