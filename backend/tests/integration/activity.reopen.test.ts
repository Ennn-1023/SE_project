import { afterEach, describe, expect, it } from 'vitest';
import type { TeacherActivityView } from '@buzzer/shared';
import { startActivityServer, type ActivityTestServer } from '../helpers/activity';

let t: ActivityTestServer;
let id: string;
afterEach(async () => {
  await t?.stop();
});

async function setup() {
  t = await startActivityServer();
  id = await t.startActivity();
}

describe('重新開放（004 US2-8、US2-9、FR-007a、SC-011）', () => {
  it('未帶 confirm: true → 409 REOPEN_NOT_CONFIRMED；非已結束 → 409 QUESTION_NOT_CLOSED', async () => {
    await setup();
    const notClosed = await t.api.reopen(`${id}-1`, 60, true);
    expect(notClosed.status).toBe(409);
    expect(notClosed.body.error.code).toBe('QUESTION_NOT_CLOSED');

    await t.api.open(`${id}-1`, 60);
    await t.api.close();
    for (const confirm of [undefined, false, 'true', 1]) {
      const res = await t.api.reopen(`${id}-1`, 60, confirm);
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        code: 'REOPEN_NOT_CONFIRMED',
        field: 'confirm',
        message: '重新開放會取代本題目前的結果',
        hint: '請在確認視窗按「確定重新開放」後再送出',
      });
    }
    expect((await t.api.get()).body.phase).toBe('CLOSED');
  });

  it('已結束題目用 open 再開放 → 409 QUESTION_ALREADY_CLOSED 並提示使用重新開放', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    await t.api.close();
    const res = await t.api.open(`${id}-1`, 60);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'QUESTION_ALREADY_CLOSED',
      message: '第 1 題已結束',
      hint: '如需讓各組重答，請使用「重新開放」',
    });
  });

  it('重開後各組可再送出；新一輪結束後舊輪作廢，所有查詢只回新一輪（SC-011）', async () => {
    await setup();
    const b = await t.loginAs('S201');
    const a = await t.loginAs('S101');
    await t.api.open(`${id}-1`, 60);
    expect((await t.submit(b, `${id}-1`, '舊答案')).status).toBe(201);
    await t.api.close();

    const reopened = await t.api.reopen(`${id}-1`, 30, true);
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({ phase: 'ANSWERING', monitor: { round: 2, submittedCount: 0 } });
    // 新一輪結束前，舊結果仍是有效結果（重啟可恢復）
    expect(t.server.ctx.repo.getResult(id, `${id}-1`)).toMatchObject({ round: 1, winnerTeam: 'T2' });

    expect((await t.submit(a, `${id}-1`, '新答案')).status).toBe(201);
    expect((await t.submit(b, `${id}-1`, 'B 重答')).status).toBe(201);
    const closed = (await t.api.close()).body as TeacherActivityView;
    expect(closed.result).toMatchObject({ round: 2 });
    expect(closed.result!.rows.map((r) => [r.teamId, r.rank])).toEqual([
      ['T1', 1],
      ['T2', 2],
      ['T3', null],
      ['T4', null],
    ]);
    expect(closed.questions[0]).toMatchObject({ round: 2, winnerTeamName: '第 1 組' });

    const result = await t.api.result(`${id}-1`);
    expect(result.body.rows.map((r: { answers: { answer: string }[] | null }) => r.answers?.[0]?.answer ?? null)).toEqual([
      '新答案',
      'B 重答',
      null,
      null,
    ]);
    const dev = await t.http.get('/api/dev/results').set('Cookie', t.teacherCookie);
    expect(dev.body).toEqual([expect.objectContaining({ question_id: `${id}-1`, answer: '新答案', winner_team: 'T1' })]);
    // 舊輪保留在紀錄中並標為作廢
    expect(
      t.server.ctx.repo.listAllSubmissions(id, `${id}-1`).map((s) => [s.round, s.teamId, s.voided]),
    ).toEqual([
      [1, 'T2', true],
      [2, 'T1', false],
      [2, 'T2', false],
    ]);
    const event = t.server.container.repos.activityEvents
      .listByActivity(id)
      .find((e) => e.type === 'QUESTION_REOPENED');
    expect(event?.detail).toBe('第 2 輪，30 秒；將取代原結果（第 2 組搶答成功）');
    expect(event?.detail).not.toContain('舊答案');
  });

  it('連點重開只開啟一輪（Edge Case）', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    await t.api.close();
    const results = await Promise.all([
      t.api.reopen(`${id}-1`, 60, true),
      t.api.reopen(`${id}-1`, 60, true),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(t.server.ctx.repo.getQuestion(`${id}-1`)?.currentRound).toBe(2);
    const reopened = t.server.container.repos.activityEvents
      .listByActivity(id)
      .filter((e) => e.type === 'QUESTION_REOPENED');
    expect(reopened).toHaveLength(1);
  });
});
