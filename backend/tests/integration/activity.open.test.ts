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

describe('選題開放（004 US2、FR-007～FR-009、FR-012、FR-013）', () => {
  it('開放後老師與學生 1 秒內收到作答中與相同的 endsAt（US2-2）', async () => {
    await setup();
    const teacher = await t.connectTeacher();
    const student = await t.connect(await t.loginAs('S201'));
    const tWait = teacher.waitFor((v) => v.phase === 'ANSWERING', 1000);
    const sWait = student.waitFor((v) => v.phase === 'ANSWERING', 1000);

    const res = await t.api.open(`${id}-1`, 60);
    expect(res.status).toBe(200);
    const view = res.body as TeacherActivityView;
    expect(view).toMatchObject({ phase: 'ANSWERING', current: { label: '1' } });
    expect(view.monitor).toMatchObject({ submittedCount: 0, teamCount: 4, allSubmitted: false });
    const [tv, sv] = await Promise.all([tWait, sWait]);
    expect(tv.endsAt).toBe(view.endsAt);
    expect(sv.endsAt).toBe(view.endsAt);
    expect(Date.parse(view.endsAt!) - Date.parse(view.serverNow)).toBeGreaterThan(59_000);
    expect(t.server.ctx.repo.getQuestion(`${id}-1`)).toMatchObject({ seconds: 60, currentRound: 1 });
  });

  it('題組開放時學生收到共同題幹與小題（FR-030a）', async () => {
    await setup();
    const student = await t.connect(await t.loginAs('S201'));
    await t.api.open(`${id}-2`, 60);
    const sv = await student.waitFor((v) => v.phase === 'ANSWERING');
    expect(sv.question).toMatchObject({
      label: '2',
      kind: 'GROUP',
      stem: '閱讀下列敘述後回答。',
      parts: [
        { partIndex: 0, partLabel: '（1）', text: '小題一的題目' },
        { partIndex: 1, partLabel: '（2）', text: '小題二的題目' },
      ],
    });
  });

  it.each([4, 601, 0, -1, 60.5, '60', '', ' ', null])(
    '秒數 %j 被拒（data-model.md §4 seconds），題目不開放（US2-10）',
    async (seconds) => {
      await setup();
      const res = await t.api.open(`${id}-1`, seconds);
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({
        code: 'INVALID_SECONDS',
        field: 'seconds',
        message: '作答秒數須為 5～600 的整數',
        hint: '例如 60',
      });
      expect((await t.api.get()).body.phase).toBe('WAITING');
    },
  );

  it.each([5, 600])('秒數 %s 可開放（邊界）', async (seconds) => {
    await setup();
    expect((await t.api.open(`${id}-1`, seconds)).status).toBe(200);
  });

  it('省略秒數時預設 60 秒', async () => {
    await setup();
    const view = (await t.api.open(`${id}-1`)).body as TeacherActivityView;
    expect(Date.parse(view.endsAt!) - Date.parse(view.serverNow)).toBeGreaterThan(59_000);
  });

  it('未知題目 404、缺 questionId 400', async () => {
    await setup();
    expect((await t.api.open(`${id}-99`, 60)).status).toBe(404);
    const missing = await t.http.post('/api/teacher/activity/open').set('Cookie', t.teacherCookie).send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'questionId' });
  });

  it('作答中開放另一題被拒並說明（US2-7）；重複開放同一題為無變化（FR-014）', async () => {
    await setup();
    const first = (await t.api.open(`${id}-1`, 60)).body as TeacherActivityView;
    const other = await t.api.open(`${id}-2`, 60);
    expect(other.status).toBe(409);
    expect(other.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: '目前第 1 題作答中',
      hint: '請先結束搶答再開放其他題目',
    });
    const again = await t.api.open(`${id}-1`, 30);
    expect(again.status).toBe(200);
    expect(again.body.endsAt).toBe(first.endsAt);
    const opened = t.server.container.repos.activityEvents
      .listByActivity(id)
      .filter((e) => e.type === 'QUESTION_OPENED');
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ questionId: `${id}-1`, detail: '60 秒' });
  });

  it('結束後直接開放下一題：學生由結果直接切到新題；預選下一個未開放題目（US2-6、US2-6a）', async () => {
    await setup();
    const student = await t.connect(await t.loginAs('S201'));
    await t.api.open(`${id}-1`, 60);
    const closed = (await t.api.close()).body as TeacherActivityView;
    expect(closed.phase).toBe('CLOSED');
    expect(closed.preselectedQuestionId).toBe(`${id}-2`);
    await student.waitFor((v) => v.phase === 'CLOSED');

    const res = await t.api.open(`${id}-2`, 30);
    expect(res.body).toMatchObject({ phase: 'ANSWERING', current: { label: '2' } });
    const sv = await student.waitFor((v) => v.phase === 'ANSWERING' && v.question?.label === '2');
    expect(sv.myTeamSubmission).toBeNull();
    // 學生在兩題之間沒有經過等待畫面
    const phases = student.states.map((v) => v.phase);
    expect(phases.slice(phases.lastIndexOf('CLOSED'))).toEqual(['CLOSED', 'ANSWERING']);
  });

  it('回到等待畫面：學生回等待；已在等待時為無變化（US2-6b）', async () => {
    await setup();
    const student = await t.connect(await t.loginAs('S201'));
    await t.api.open(`${id}-1`, 60);
    await t.api.close();
    const back = await t.api.back();
    expect(back.body.phase).toBe('WAITING');
    await student.waitFor((v) => v.phase === 'WAITING' && student.states.some((s) => s.phase === 'CLOSED'));
    expect((await t.api.back()).status).toBe(200);
  });

  it('參與組別為開放當下有成員的組（question_participants.member_count，FR-013）', async () => {
    await setup();
    t.db.prepare(`UPDATE users SET group_number = NULL WHERE account = 'S401'`).run();
    await t.api.open(`${id}-1`, 60);
    expect(t.server.ctx.repo.listParticipants(id, `${id}-1`, 1).map((p) => [p.teamId, p.memberCount])).toEqual([
      ['T1', 2],
      ['T2', 1],
      ['T3', 1],
    ]);
    expect((await t.api.get()).body.monitor.teamCount).toBe(3);
  });

  it('全部題目結束後沒有預選題目', async () => {
    await setup();
    for (const n of [1, 2, 3]) {
      await t.api.open(`${id}-${n}`, 60);
      await t.api.close();
    }
    const view = (await t.api.get()).body as TeacherActivityView;
    expect(view.preselectedQuestionId).toBeNull();
    expect(view.progress).toEqual({ closed: 3, total: 3 });
  });
});
