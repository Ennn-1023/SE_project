import { afterEach, describe, expect, it } from 'vitest';
import { startActivityServer, type ActivityTestServer } from '../helpers/activity';

let t: ActivityTestServer;
afterEach(async () => {
  await t?.stop();
});

const LOCKED = {
  code: 'QUESTION_SET_LOCKED',
  field: null,
  message: '搶答活動進行中，無法變更題目集',
  hint: '請先結束活動',
};

describe('活動進行中鎖定題目集（004 US1-5、FR-005）', () => {
  it('活動未結束時清除、重新匯入、確認匯入都回 409 QUESTION_SET_LOCKED，題目集不變', async () => {
    t = await startActivityServer();
    await t.startActivity();
    const cookie = t.teacherCookie;

    const clear = await t.http.delete('/api/question-set').set('Cookie', cookie);
    expect(clear.status).toBe(409);
    expect(clear.body.error).toEqual(LOCKED);

    const reimport = await t.http.post('/api/question-set/reimport').set('Cookie', cookie).send({});
    expect(reimport.status).toBe(409);
    expect(reimport.body.error).toEqual(LOCKED);

    const confirm = await t.http
      .post('/api/question-import/drafts/3f8e1c52-6a0b-4d55-9a37-5b1d2f2f7c10/confirm')
      .set('Cookie', cookie)
      .send({});
    expect(confirm.status).toBe(409);
    expect(confirm.body.error).toEqual(LOCKED);

    const set = await t.http.get('/api/question-set').set('Cookie', cookie);
    expect(set.body.questionSet.questionCount).toBe(3);
  });

  it('作答中、已結束也鎖定；活動結束後解除（可清除）', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    await t.api.open(`${id}-1`, 60);
    expect((await t.http.delete('/api/question-set').set('Cookie', t.teacherCookie)).status).toBe(409);
    await t.api.close();
    expect((await t.http.delete('/api/question-set').set('Cookie', t.teacherCookie)).status).toBe(409);
    await t.api.end();
    expect((await t.http.delete('/api/question-set').set('Cookie', t.teacherCookie)).status).toBe(204);
  });

  it('沒有活動時不鎖定（邊界）', async () => {
    t = await startActivityServer();
    expect((await t.http.delete('/api/question-set').set('Cookie', t.teacherCookie)).status).toBe(204);
  });
});

describe('作答中鎖定組別（004 FR-006、T073）', () => {
  const GROUP_LOCKED = {
    code: 'GROUP_CHANGE_LOCKED',
    field: null,
    message: '搶答作答中，無法調整組別',
    hint: '請於本題結束後再調整組別',
  };

  it('作答中：老師指派、設定組數、學生自選都回 409，組別不變', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    await t.api.open(`${id}-1`, 60);

    const assign = await t.http
      .put('/api/groups/assignments/S201')
      .set('Cookie', t.teacherCookie)
      .send({ groupNumber: 3 });
    expect(assign.status).toBe(409);
    expect(assign.body.error).toEqual(GROUP_LOCKED);

    const count = await t.http.put('/api/groups/settings').set('Cookie', t.teacherCookie).send({ groupCount: 6 });
    expect(count.status).toBe(409);
    expect(count.body.error).toEqual(GROUP_LOCKED);

    const self = await t.http.post('/api/groups/me').set('Cookie', await t.loginAs('S900')).send({ groupNumber: 1 });
    expect(self.status).toBe(409);
    expect(self.body.error).toEqual(GROUP_LOCKED);

    expect(t.server.ctx.repo.getStudent('S201')?.teamId).toBe('T2');
    expect(t.server.ctx.repo.getStudent('S900')?.teamId).toBeNull();
  });

  it('等待開放與已結束時允許改組，只影響之後開放的題目', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    const ok = await t.http.put('/api/groups/assignments/S900').set('Cookie', t.teacherCookie).send({ groupNumber: 4 });
    expect(ok.status).toBe(200);
    await t.api.open(`${id}-1`, 60);
    await t.api.close();
    const ok2 = await t.http.put('/api/groups/assignments/S900').set('Cookie', t.teacherCookie).send({ groupNumber: 3 });
    expect(ok2.status).toBe(200);
    expect(t.server.ctx.repo.listParticipants(id, `${id}-1`, 1).find((p) => p.teamId === 'T4')?.memberCount).toBe(2);
  });
});

