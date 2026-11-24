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

describe('結束整場活動（004 US5、FR-004）', () => {
  it('等待開放時結束：學生 1 秒內看到活動結束，readiness 回來供開始新活動（US5-1、US5-3）', async () => {
    await setup();
    const student = await t.connect(await t.loginAs('S201'));
    const ended = student.waitFor((v) => v.phase === 'ENDED', 1000);
    const res = await t.api.end();
    expect(res.status).toBe(200);
    const view = res.body as TeacherActivityView;
    expect(view).toMatchObject({ phase: 'ENDED', monitor: null, preselectedQuestionId: null });
    expect(view.readiness).toMatchObject({ questionCount: 3 });
    expect(view.questions.map((q) => q.status)).toEqual(['NOT_OPENED', 'NOT_OPENED', 'NOT_OPENED']);
    await ended;
    const events = t.server.container.repos.activityEvents.listByActivity(id);
    expect(events.at(-1)).toMatchObject({ type: 'ENDED', actorId: expect.any(Number) });
  });

  it('已結束題目後結束活動：結果保留在摘要中', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    await t.submit(await t.loginAs('S201'), `${id}-1`, '答案');
    await t.api.close();
    const view = (await t.api.end()).body as TeacherActivityView;
    expect(view.progress).toEqual({ closed: 1, total: 3 });
    expect(view.questions[0]).toMatchObject({ status: 'CLOSED', winnerTeamName: '第 2 組' });
    expect((await t.api.result(`${id}-1`)).status).toBe(200);
  });

  it('作答中結束：先產生結果（已送出答案保留）再結束（US5-2）', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    await t.submit(await t.loginAs('S201'), `${id}-1`, '已送出');
    await t.api.end();
    expect(t.server.ctx.repo.getResult(id, `${id}-1`)).toMatchObject({
      closedReason: 'ACTIVITY_ENDED',
      winnerTeam: 'T2',
      answer: '已送出',
    });
  });

  it('再次結束為 200 無變化；結束後學生送出被拒', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    await t.api.end();
    expect((await t.api.end()).status).toBe(200);
    expect(t.server.container.repos.activityEvents.listByActivity(id).filter((e) => e.type === 'ENDED')).toHaveLength(1);
    const res = await t.submit(await t.loginAs('S201'), `${id}-1`, '太晚了');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVITY_ENDED');
  });

  it('開始新活動：題目重新從未開放開始，上一場結果不出現在新看板（US5-4）', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    await t.api.close();
    await t.api.end();
    const next = await t.startActivity();
    const view = (await t.api.get()).body as TeacherActivityView;
    expect(view.activity!.id).toBe(next);
    expect(view.questions.every((q) => q.status === 'NOT_OPENED')).toBe(true);
    expect(t.server.ctx.repo.listResults(id)).toHaveLength(1);
  });
});
