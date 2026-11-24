import { afterEach, describe, expect, it } from 'vitest';
import type { TeacherActivityView } from '@buzzer/shared';
import { addTenTeams } from '../helpers/testServer';
import { startActivityServer, type ActivityTestServer } from '../helpers/activity';

let t: ActivityTestServer;
afterEach(async () => {
  await t?.stop();
});

describe('老師即時監控同步（004 US3、FR-015、FR-016、FR-024、SC-002、SC-003）', () => {
  it('B、A、C 依序送出：兩個老師連線 1 秒內一致更新，B 為目前最快', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    const t1 = await t.connectTeacher();
    const t2 = await t.connectTeacher();
    await t.api.open(`${id}-1`, 60);

    const order: Array<[string, string]> = [
      ['S201', 'T2'],
      ['S101', 'T1'],
      ['S301', 'T3'],
    ];
    for (const [i, [studentId, teamId]] of order.entries()) {
      const started = Date.now();
      const waits = [t1, t2].map((c) =>
        c.waitFor((v) => v.monitor?.submittedCount === i + 1, 1000),
      );
      expect((await t.submit(await t.loginAs(studentId), `${id}-1`, `${teamId} 的答案`)).status).toBe(201);
      const [v1, v2] = await Promise.all(waits);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(v1!.monitor).toEqual(v2!.monitor);
    }
    const view = t1.last()!;
    expect(view.monitor!.teams.map((r) => [r.teamId, r.rank])).toEqual([
      ['T2', 1],
      ['T1', 2],
      ['T3', 3],
      ['T4', null],
    ]);
    expect(view.monitor!.teams[0]).toMatchObject({
      submitterName: '陳大文',
      answers: [{ partIndex: 0, partLabel: null, answer: 'T2 的答案' }],
    });
    expect(view.monitor).toMatchObject({ submittedCount: 3, teamCount: 4, allSubmitted: false });
  });

  it('10 組同時送出：看板順位與伺服器接受順序一致、無重複（SC-003）', async () => {
    t = await startActivityServer();
    const cookies = await addTenTeams(t);
    const id = await t.startActivity();
    const teacher = await t.connectTeacher();
    await t.api.open(`${id}-1`, 60);
    const results = await Promise.all(cookies.map((c, i) => t.submit(c, `${id}-1`, `答案 ${i}`)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const view = await teacher.waitFor((v) => v.monitor?.submittedCount === 10, 2000);
    const ranks = view.monitor!.teams.filter((r) => r.submitted).map((r) => r.rank);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const accepted = t.server.ctx.submissions.all().map((s) => s.teamId);
    expect(view.monitor!.teams.filter((r) => r.submitted).map((r) => r.teamId)).toEqual(accepted);
    expect(view.monitor!.allSubmitted).toBe(true);
  });

  it('重新整理（GET）與推播內容一致；重連後立即取得完整狀態（FR-024）', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    await t.api.open(`${id}-1`, 60);
    await t.submit(await t.loginAs('S201'), `${id}-1`, '答案');
    const rest = (await t.api.get()).body as TeacherActivityView;
    const late = await t.connectTeacher();
    const pushed = await late.waitFor(() => true, 1000);
    expect(pushed.monitor).toEqual(rest.monitor);
    expect(pushed.endsAt).toBe(rest.endsAt);
    expect(pushed.questions).toEqual(rest.questions);
  });

  it('階段變化（開放、結束、回到等待、結束活動）都推送給老師', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    const teacher = await t.connectTeacher();
    await t.api.open(`${id}-1`, 60);
    await teacher.waitFor((v) => v.phase === 'ANSWERING', 1000);
    await t.api.close();
    await teacher.waitFor((v) => v.phase === 'CLOSED', 1000);
    await t.api.back();
    await teacher.waitFor((v) => v.phase === 'WAITING' && v.progress.closed === 1, 1000);
    await t.api.end();
    await teacher.waitFor((v) => v.phase === 'ENDED', 1000);
  });
});
