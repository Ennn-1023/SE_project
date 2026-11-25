import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;
beforeEach(async () => {
  t = await startTestServer();
});
afterEach(async () => {
  await t.stop();
});

const phase = async () => (await t.http.get('/api/dev/teacher/status').set('Cookie', t.teacherCookie)).body.phase as string;

describe('模擬老師操作（US6、Q-T16、FR-022、FR-023）', () => {
  it('正常流程：open → time-up → next → open → close → end，學生畫面依序切換', async () => {
    const client = await t.connect(await t.loginAs('S201'));
    const open = await t.teacher.open('Q1', 30);
    expect(open.status).toBe(200);
    expect(open.body).toMatchObject({ phase: 'ANSWERING', currentQuestionId: 'Q1' });
    expect(Date.parse(open.body.endsAt) - Date.now()).toBeGreaterThan(28_000);

    expect((await t.teacher.timeUp()).body.phase).toBe('CLOSED');
    expect((await t.teacher.next()).body).toEqual({ phase: 'WAITING', currentQuestionId: null, endsAt: null });
    expect((await t.teacher.open('Q2')).body.phase).toBe('ANSWERING');
    expect((await t.teacher.close()).body.phase).toBe('CLOSED');
    expect((await t.teacher.end()).body.phase).toBe('ENDED');

    await client.waitFor((v) => v.phase === 'ENDED');
    expect(client.states.map((v) => v.phase)).toEqual(
      expect.arrayContaining(['WAITING', 'ANSWERING', 'CLOSED', 'ENDED']),
    );
  });

  it('seconds 省略時預設 60 秒', async () => {
    const res = await t.teacher.open('Q1');
    const remaining = Date.parse(res.body.endsAt) - Date.now();
    expect(remaining).toBeGreaterThan(58_000);
    expect(remaining).toBeLessThanOrEqual(60_000);
  });

  it('作答中再開放另一題回 409 INVALID_TRANSITION，階段不變', async () => {
    await t.teacher.open('Q1', 60);
    const res = await t.teacher.open('Q2', 60);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: '目前第 1 題作答中',
      hint: '請先結束搶答再開放其他題目',
    });
    const status = (await t.http.get('/api/dev/teacher/status').set('Cookie', t.teacherCookie)).body;
    expect(status).toMatchObject({ phase: 'ANSWERING', currentQuestionId: 'Q1' });
  });

  it.each([0, 4, 601, 'abc', 30.5, null])('seconds=%s 回 400 INVALID_SECONDS，階段不變', async (seconds) => {
    const res = await t.http.post('/api/dev/teacher/open').set('Cookie', t.teacherCookie).send({ questionId: 'Q1', seconds });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'INVALID_SECONDS',
      field: 'seconds',
      message: '作答秒數須為 5～600 的整數',
      hint: '例如 60',
    });
    expect(await phase()).toBe('WAITING');
  });

  it('不存在的題目回 404 QUESTION_NOT_FOUND；缺少 questionId 回 400', async () => {
    const res = await t.teacher.open('Q999', 60);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'QUESTION_NOT_FOUND', field: 'questionId' });
    const missing = await t.http.post('/api/dev/teacher/open').set('Cookie', t.teacherCookie).send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'questionId' });
  });

  it('已經有結果的題目再次開放回 409 QUESTION_ALREADY_CLOSED', async () => {
    await t.teacher.open('Q1', 60);
    await t.teacher.close();
    await t.teacher.next();
    const res = await t.teacher.open('Q1', 60);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'QUESTION_ALREADY_CLOSED',
      message: '第 1 題已結束',
      hint: '如需讓各組重答，請使用「重新開放」',
    });
    expect(await phase()).toBe('WAITING');
  });

  it('body 不是 JSON 物件或欄位型別錯誤時回中文訊息（憲章原則 II）', async () => {
    const arr = await t.http.post('/api/dev/teacher/open').set('Cookie', t.teacherCookie).send([1]);
    expect(arr.status).toBe(400);
    expect(arr.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'body', message: '請求內容必須是 JSON 物件' });

    const num = await t.http.post('/api/dev/teacher/open').set('Cookie', t.teacherCookie).send({ questionId: 1 });
    expect(num.body.error).toMatchObject({ field: 'questionId', message: 'questionId 必須是文字' });

    const sub = await t.http
      .post('/api/student/submissions')
      .set('Cookie', await t.loginAs('S201'))
      .send({ questionId: { id: 'Q1' }, answer: 'x' });
    expect(sub.body.error).toMatchObject({ field: 'questionId', message: 'questionId 必須是文字' });

    for (const r of [arr, num, sub]) expect(r.body.error.message).not.toMatch(/Invalid|expected|received/);
    expect(await phase()).toBe('WAITING');
  });

  it('等待開放時不能 time-up／close；回到等待在等待開放時為無變化（004 research.md R11）', async () => {
    expect((await t.teacher.timeUp()).body.error.code).toBe('INVALID_TRANSITION');
    expect((await t.teacher.close()).body.error.code).toBe('INVALID_TRANSITION');
    const back = await t.teacher.next();
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ phase: 'WAITING' });
    await t.teacher.open('Q1', 60);
    expect((await t.teacher.next()).body.error.code).toBe('INVALID_TRANSITION');
  });

  it('ENDED 後 reset 回到 WAITING，而且結果被清空', async () => {
    const tok = await t.loginAs('S201');
    await t.teacher.open('Q1', 60);
    await t.submit(tok, 'Q1', '答案');
    await t.teacher.end();
    expect((await t.http.get('/api/dev/results').set('Cookie', t.teacherCookie)).body).toHaveLength(1);

    const res = await t.teacher.reset();
    expect(res.body).toEqual({ phase: 'WAITING', currentQuestionId: null, endsAt: null });
    expect((await t.http.get('/api/dev/results').set('Cookie', t.teacherCookie)).body).toEqual([]);
    expect((await t.teacher.open('Q1', 60)).status).toBe(200);
  });

  it('GET /api/dev/teacher/status 回傳目前階段與題目清單（contracts/rest-api.md）', async () => {
    const res = await t.http.get('/api/dev/teacher/status').set('Cookie', t.teacherCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      phase: 'WAITING',
      currentQuestionId: null,
      endsAt: null,
      questions: [
        { questionId: 'Q1', number: 1, text: '請說明 TCP 三向交握的三個步驟。' },
        { questionId: 'Q2', number: 2, text: 'HTTP 狀態碼 404 與 500 分別代表什麼？' },
        { questionId: 'Q3', number: 3, text: '請舉一個「先寫測試再實作」的好處。' },
      ],
    });
    await t.teacher.open('Q2', 30);
    const answering = (await t.http.get('/api/dev/teacher/status').set('Cookie', t.teacherCookie)).body;
    expect(answering).toMatchObject({ phase: 'ANSWERING', currentQuestionId: 'Q2' });
    expect(typeof answering.endsAt).toBe('string');
  });
});
