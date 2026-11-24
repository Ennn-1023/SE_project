import { afterEach, describe, expect, it } from 'vitest';
import type { ResultBoardView, TeacherActivityView } from '@buzzer/shared';
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

describe('結果看板與回顧（004 US4、FR-018、FR-019）', () => {
  it('B、A、C 送出後結束：依順位、B 搶答成功、D 未送出、結束原因（US4-1）', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    for (const s of ['S201', 'S101', 'S301']) await t.submit(await t.loginAs(s), `${id}-1`, `${s} 答案`);
    const view = (await t.api.close()).body as TeacherActivityView;
    const result = view.result!;
    expect(result).toMatchObject({ closedReason: 'MANUAL', noSubmission: false, round: 1 });
    expect(result.rows.map((r) => [r.teamName, r.rank, r.submitted])).toEqual([
      ['第 2 組', 1, true],
      ['第 1 組', 2, true],
      ['第 3 組', 3, true],
      ['第 4 組', null, false],
    ]);
    expect(result.rows[0]).toMatchObject({ submitterName: '陳大文', answers: [{ answer: 'S201 答案' }] });
    expect(result.rows[0]!.elapsedSeconds).toEqual(expect.any(Number));
    expect(view.questions[0]).toMatchObject({ status: 'CLOSED', winnerTeamName: '第 2 組' });
    expect(view.progress).toEqual({ closed: 1, total: 3 });
  });

  it('無人送出：noSubmission 且所有組別為未送出（US4-2）', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    const result = ((await t.api.close()).body as TeacherActivityView).result!;
    expect(result.noSubmission).toBe(true);
    expect(result.rows.every((r) => !r.submitted)).toBe(true);
  });

  it('題組結果依小題分列（US4-3）', async () => {
    await setup();
    await t.api.open(`${id}-2`, 60);
    await t.submitAnswers(await t.loginAs('S201'), `${id}-2`, ['甲', '乙']);
    const result = ((await t.api.close()).body as TeacherActivityView).result!;
    expect(result.rows[0]!.answers).toEqual([
      { partIndex: 0, partLabel: '（1）', answer: '甲' },
      { partIndex: 1, partLabel: '（2）', answer: '乙' },
    ]);
  });

  it('答案中的 HTML 與換行原樣保存（由前端以純文字顯示，US4-4）', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    const html = '<img src=x onerror=alert(1)>\n第二行';
    await t.submit(await t.loginAs('S201'), `${id}-1`, html);
    const result = ((await t.api.close()).body as TeacherActivityView).result!;
    expect(result.rows[0]!.answers![0]!.answer).toBe(html);
  });

  it('在其他題作答中仍可查看已結束題目的結果（唯讀，US4-5）', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    await t.submit(await t.loginAs('S201'), `${id}-1`, '第一題答案');
    await t.api.close();
    await t.api.open(`${id}-2`, 60);
    const res = await t.api.result(`${id}-1`);
    expect(res.status).toBe(200);
    const result = res.body as ResultBoardView;
    expect(result.question.label).toBe('1');
    expect(result.rows[0]).toMatchObject({ teamName: '第 2 組', rank: 1 });
    expect((await t.api.get()).body).toMatchObject({ phase: 'ANSWERING', current: { label: '2' } });
  });

  it('未結束的題目回 409 QUESTION_NOT_CLOSED；未知題目回 404', async () => {
    await setup();
    const notClosed = await t.api.result(`${id}-1`);
    expect(notClosed.status).toBe(409);
    expect(notClosed.body.error.code).toBe('QUESTION_NOT_CLOSED');
    expect((await t.api.result(`${id}-99`)).status).toBe(404);
  });
});
