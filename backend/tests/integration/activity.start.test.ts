import { afterEach, describe, expect, it } from 'vitest';
import type { TeacherActivityView } from '@buzzer/shared';
import { sampleQuestionSet, startActivityServer, type ActivityTestServer } from '../helpers/activity';

let t: ActivityTestServer;
afterEach(async () => {
  await t?.stop();
});

describe('開始活動（004 US1、FR-001～FR-003）', () => {
  it('尚未開始時 GET 回 NONE，readiness 列出題目集來源、題數與各組人數（US1-1）', async () => {
    t = await startActivityServer();
    const res = await t.api.get();
    expect(res.status).toBe(200);
    const view = res.body as TeacherActivityView;
    expect(view).toMatchObject({ phase: 'NONE', activity: null, questions: [], monitor: null });
    expect(view.readiness).toMatchObject({ questionCount: 3, sourceTitle: '測試學習單／學習單' });
    expect(view.readiness!.teams.map((x) => [x.name, x.members])).toEqual([
      ['第 1 組', 2],
      ['第 2 組', 1],
      ['第 3 組', 1],
      ['第 4 組', 1],
    ]);
  });

  it('開始後進入 WAITING，題目、題號、小題與順序複製正確，學生 1 秒內收到等待畫面（US1-2）', async () => {
    t = await startActivityServer();
    const student = await t.connect(await t.loginAs('S201'));
    expect(student.last()?.phase).toBe('NO_ACTIVITY');
    const waiting = student.waitFor((v) => v.phase === 'WAITING', 1000);

    const res = await t.api.start();
    expect(res.status).toBe(200);
    const view = res.body as TeacherActivityView;
    expect(view.phase).toBe('WAITING');
    expect(view.activity!.id).toMatch(/^ACT-\d{14}-[0-9a-f]{4}$/);
    expect(view.progress).toEqual({ closed: 0, total: 3 });
    expect(view.questions.map((q) => [q.label, q.kind, q.status])).toEqual([
      ['1', 'SINGLE', 'NOT_OPENED'],
      ['2', 'GROUP', 'NOT_OPENED'],
      ['3', 'SINGLE', 'NOT_OPENED'],
    ]);
    expect(view.questions[1]).toMatchObject({
      stem: '閱讀下列敘述後回答。',
      parts: [
        { partIndex: 0, partLabel: '（1）', text: '小題一的題目' },
        { partIndex: 1, partLabel: '（2）', text: '小題二的題目' },
      ],
    });
    expect(view.preselectedQuestionId).toBe(`${view.activity!.id}-1`);
    await waiting;
  });

  it('之後題目集變動不影響本場題目（FR-002）', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    // 直接改寫資料表（略過鎖定）模擬題目集被取代
    t.server.container.repos.questionSets.replace(sampleQuestionSet(1));
    const view = (await t.api.get()).body as TeacherActivityView;
    expect(view.questions).toHaveLength(3);
    expect(view.questions[0]!.questionId).toBe(`${id}-1`);
  });

  it('尚未匯入題目 → 409 NO_QUESTION_SET（US1-3）', async () => {
    t = await startActivityServer({ seed: false });
    const res = await t.api.start();
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'NO_QUESTION_SET',
      field: null,
      message: '尚未匯入題目',
      hint: '請先到題目管理匯入學習單',
    });
    expect((await t.api.get()).body.phase).toBe('NONE');
  });

  it('沒有任何組別有學生 → 409 NO_TEAM_MEMBERS（US1-4）', async () => {
    t = await startActivityServer();
    t.db.prepare(`UPDATE users SET group_number = NULL WHERE role = 'STUDENT'`).run();
    const res = await t.api.start();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'NO_TEAM_MEMBERS',
      message: '尚無任何組別有學生',
      hint: '請先到組別管理分組',
    });
  });

  it('已有進行中的活動 → 409 ACTIVITY_ALREADY_RUNNING；結束後可開始新活動，上一場結果保留（FR-003）', async () => {
    t = await startActivityServer();
    const first = await t.startActivity();
    const again = await t.api.start();
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ACTIVITY_ALREADY_RUNNING');

    await t.api.open(`${first}-1`, 60);
    await t.submit(await t.loginAs('S201'), `${first}-1`, '第一場答案');
    await t.api.close();
    await t.api.end();
    const second = await t.startActivity();
    expect(second).not.toBe(first);
    const view = (await t.api.get()).body as TeacherActivityView;
    expect(view.progress).toEqual({ closed: 0, total: 3 });
    expect(t.server.ctx.repo.getResult(first, `${first}-1`)).toMatchObject({ winnerTeam: 'T2' });
  });

  it('寫入 STARTED 活動事件（FR-029）', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    const events = t.server.container.repos.activityEvents.listByActivity(id);
    expect(events).toEqual([
      expect.objectContaining({ type: 'STARTED', actorId: expect.any(Number), detail: '3 題' }),
    ]);
  });

  it('學生在沒有活動時送出 → 409 NO_ACTIVITY（Edge Case）', async () => {
    t = await startActivityServer();
    const res = await t.submit(await t.loginAs('S201'), 'Q1', '答案');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'NO_ACTIVITY', message: '目前沒有進行中的活動' });
  });

  it('記錄寫回目標與作答格後備位置，之後重新匯入不影響本場（005 FR-005）', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    const activityRow = () =>
      t.db
        .prepare(
          `SELECT spreadsheet_id, spreadsheet_title, sheet_id, sheet_title, source_url FROM activities WHERE id = ?`,
        )
        .get(id);
    const cells = () =>
      t.db
        .prepare(
          `SELECT q.number, p.part_index, p.answer_cell FROM question_parts p
           JOIN questions q ON q.question_id = p.question_id WHERE q.activity_id = ? ORDER BY q.number, p.part_index`,
        )
        .all(id);
    const expectedSource = {
      spreadsheet_id: 'x'.repeat(30),
      spreadsheet_title: '測試學習單',
      sheet_id: 0,
      sheet_title: '學習單',
      source_url: 'https://docs.google.com/spreadsheets/d/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/edit',
    };
    const expectedCells = [
      { number: 1, part_index: 0, answer_cell: 'G5' },
      { number: 2, part_index: 0, answer_cell: 'H10' },
      { number: 2, part_index: 1, answer_cell: 'H11' },
      { number: 3, part_index: 0, answer_cell: 'G15' },
    ];
    expect(activityRow()).toEqual(expectedSource);
    expect(cells()).toEqual(expectedCells);

    // 重新匯入另一份學習單並結束活動：本場寫回目標不變
    const other = sampleQuestionSet(1);
    other.set.source = { ...other.set.source, spreadsheetId: 'y'.repeat(30), spreadsheetTitle: '另一份' };
    t.server.container.repos.questionSets.replace(other);
    await t.api.end();
    expect(activityRow()).toEqual(expectedSource);
    expect(cells()).toEqual(expectedCells);
    expect(t.server.ctx.repo.getCurrentActivity()?.source).toMatchObject({
      spreadsheetId: 'x'.repeat(30),
      sheetTitle: '學習單',
    });
  });
});
