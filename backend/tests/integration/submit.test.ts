import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;
beforeEach(async () => {
  t = await startTestServer();
});
afterEach(async () => {
  await t.stop();
});

describe('POST /api/student/submissions', () => {
  it('正常送出回 201，不含 rank；同組另一個分頁收到「本組已送出」（Q-T1）', async () => {
    const token = await t.loginAs('S201');
    const tab1 = await t.connect(token);
    const tab2 = await t.connect(token);
    await t.teacher.open('Q1', 60);
    const pushed = tab2.waitFor((v) => v.myTeamSubmission != null);

    const res = await t.submit(token, 'Q1', '  SYN → SYN-ACK → ACK  ');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ questionId: 'Q1', teamId: 'T2', answer: 'SYN → SYN-ACK → ACK' });
    expect(res.body).not.toHaveProperty('rank');

    expect((await pushed).myTeamSubmission).toEqual({ answer: 'SYN → SYN-ACK → ACK' });
    await tab1.waitFor((v) => v.myTeamSubmission != null);
  });

  it('同組多分頁同時送出：只有一筆成功，其他回 409 ALREADY_SUBMITTED（Q-T6）', async () => {
    const tokenA1 = await t.loginAs('S101');
    const tokenA2 = await t.loginAs('S102');
    await t.teacher.open('Q1', 60);
    const results = await Promise.all([
      t.submit(tokenA1, 'Q1', '分頁一'),
      t.submit(tokenA1, 'Q1', '分頁二'),
      t.submit(tokenA2, 'Q1', '組員'),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(r.body.error).toEqual({
        code: 'ALREADY_SUBMITTED',
        field: null,
        message: '本組已送出過此題答案，每組每題只能送出一次',
        hint: '送出後不可修改',
      });
    }
  });

  it('空白答案回 400 EMPTY_ANSWER（Q-T4）', async () => {
    const token = await t.loginAs('S201');
    await t.teacher.open('Q1', 60);
    for (const answer of ['', '   \n ']) {
      const res = await t.submit(token, 'Q1', answer);
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({ code: 'EMPTY_ANSWER', field: 'answer', message: '答案不可為空', hint: '請輸入內容後再送出' });
    }
  });

  it('剛好 500 字成功，501 字回 400 ANSWER_TOO_LONG 並說明字數（Q-T5）', async () => {
    const tokenB = await t.loginAs('S201');
    const tokenC = await t.loginAs('S301');
    await t.teacher.open('Q1', 60);
    const tooLong = await t.submit(tokenB, 'Q1', '字'.repeat(501));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toMatchObject({ code: 'ANSWER_TOO_LONG', field: 'answer', message: '答案最多 500 字，目前 501 字' });
    expect((await t.submit(tokenC, 'Q1', '字'.repeat(500))).status).toBe(201);
  });

  it('answer 不是字串或缺少 questionId 回 400 VALIDATION_ERROR', async () => {
    const token = await t.loginAs('S201');
    await t.teacher.open('Q1', 60);
    const noAnswer = await t.http
      .post('/api/student/submissions')
      .set('Cookie', token)
      .send({ questionId: 'Q1', answer: 123 });
    expect(noAnswer.status).toBe(400);
    expect(noAnswer.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'answer' });
    const noQuestion = await t.http
      .post('/api/student/submissions')
      .set('Cookie', token)
      .send({ answer: 'x' });
    expect(noQuestion.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'questionId' });
  });

  it('body 不是 JSON 物件時回中文訊息（field body），不含英文技術訊息（憲章原則 II）', async () => {
    const token = await t.loginAs('S201');
    await t.teacher.open('Q1', 60);
    const res = await t.http
      .post('/api/student/submissions')
      .set('Cookie', token)
      .send([1, 2]);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      field: 'body',
      message: '請求內容必須是 JSON 物件',
      hint: '請以 JSON 物件格式送出，例如 {"questionId": "Q1", "answer": "你的答案"}',
    });
  });

  it('欄位型別錯誤時說明正確型別，不會誤報「必填」', async () => {
    const token = await t.loginAs('S201');
    await t.teacher.open('Q1', 60);
    const send = (body: object) =>
      t.http.post('/api/student/submissions').set('Cookie', token).send(body);

    const arr = await send({ questionId: ['Q1'], answer: 'x' });
    expect(arr.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'questionId', message: 'questionId 必須是文字' });

    const num = await send({ questionId: 'Q1', answer: 123 });
    expect(num.body.error).toMatchObject({ field: 'answer', message: 'answer 必須是文字' });

    const missing = await send({ answer: 'x' });
    expect(missing.body.error).toMatchObject({ field: 'questionId', message: 'questionId 為必填' });

    for (const r of [arr, num, missing]) {
      expect(r.status).toBe(400);
      expect(r.body.error.message).not.toMatch(/[A-Za-z]{3,} [a-z]+:|Invalid|expected|received/);
      expect(r.body.error.hint).toBeTruthy();
    }
  });

  it('未分組學生回 403 NO_TEAM（Q-T9）', async () => {
    const token = await t.loginAs('S900');
    await t.teacher.open('Q1', 60);
    const res = await t.submit(token, 'Q1', '答案');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'NO_TEAM', message: '你尚未被分配到組別', hint: '請聯絡老師' });
  });

  it('送出非目前開放的題目回 409 QUESTION_NOT_OPEN（Q-T8）', async () => {
    const token = await t.loginAs('S201');
    expect((await t.submit(token, 'Q1', '答案')).body.error.code).toBe('QUESTION_NOT_OPEN');
    await t.teacher.open('Q1', 60);
    const res = await t.submit(token, 'Q2', '答案');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'QUESTION_NOT_OPEN', field: 'questionId', message: '此題目目前未開放作答' });
  });

  it('沒有 token 回 401', async () => {
    await t.teacher.open('Q1', 60);
    const res = await t.http.post('/api/student/submissions').send({ questionId: 'Q1', answer: 'x' });
    expect(res.status).toBe(401);
  });
});
