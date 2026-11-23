/** US3：預覽與確認匯入（diagrams/003-sequence-import.puml；FR-020～FR-030）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import type request from 'supertest';
import type { AnnotatedQuestion } from '@buzzer/shared';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
import {
  draftWith,
  groupAnnotations,
  importSheet,
  question,
  singleAnnotations,
} from '../helpers/annotations.js';
import {
  connectGoogle,
  createTestApp,
  loginStudent,
  loginTeacher,
  seedStudent,
  type TestApp,
} from '../helpers/testApp.js';
import { GROUP_ID, GROUP_URL, groupSheet } from '../fixtures/google/group-sheet.js';
import {
  SHEET_TITLE,
  SINGLE_ID,
  SINGLE_URL,
  singleSheet,
} from '../fixtures/google/single-sheet.js';
import {
  answerLeftOfQuestion,
  fiftyQuestions,
  mergedAnswer,
  mixedWithStem,
  multiTab,
  oneQuestion,
  variantUrl,
} from '../fixtures/google/variants.js';

let google: FakeGoogle;
let t: TestApp;
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  google = new FakeGoogle().addSpreadsheet(singleSheet()).addSpreadsheet(groupSheet());
  t = await createTestApp({ google });
  agent = await loginTeacher(t);
  await connectGoogle(google, agent);
});

const preview = (id: string) => agent.post(`/api/question-import/drafts/${id}/preview`);
const confirm = (id: string) => agent.post(`/api/question-import/drafts/${id}/confirm`);
const count = (table: string) =>
  (t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('預覽（FR-020、FR-026、FR-027）', () => {
  it('未完成的標註 → 422 ANNOTATION_INVALID，一次列出所有問題', async () => {
    const { id } = await draftWith(agent, SINGLE_URL, [
      question('qa01', 'SINGLE', [['C5', null]]),
      question('qa02', 'SINGLE', [[null, 'G7']]),
      question('qa03', 'GROUP', []),
    ]);
    const res = await preview(id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ANNOTATION_INVALID');
    expect(res.body.error.message).toBe('標註尚未完成或有錯誤（共 3 項）');
    expect(res.body.error.details.totalIssues).toBe(3);
    expect(res.body.error.details.issues.map((i: { code: string }) => i.code)).toEqual([
      'MISSING_ANSWER_CELL',
      'MISSING_QUESTION_CELL',
      'GROUP_WITHOUT_PARTS',
    ]);
  });

  it('沒有任何題目 → 422 NO_QUESTIONS（邊界）', async () => {
    const { id } = await draftWith(agent, SINGLE_URL, []);
    const res = await preview(id);
    expect(res.status).toBe(422);
    expect(res.body.error.details.issues[0].code).toBe('NO_QUESTIONS');
  });

  it('完整 → 200 預覽：題號、文字、作答格（含分頁名稱）；沒有題目集時 replaces 為 null（正常）', async () => {
    const { id } = await draftWith(agent, GROUP_URL, groupAnnotations());
    const res = await preview(id);
    expect(res.status).toBe(200);
    const { preview: p, replaces } = res.body;
    expect(replaces).toBeNull();
    expect(p.questionCount).toBe(4);
    expect(p.slotCount).toBe(6);
    expect(p.questions[0]).toMatchObject({
      label: '1',
      kind: 'GROUP',
      stem: null,
      parts: [
        {
          partLabel: '（1）',
          text: '虛構題目 1-1：第一個小題？',
          questionCell: '學習單!C5',
          answerCell: '學習單!H5',
          answerHasContent: false,
        },
        { partLabel: '（2）', questionCell: '學習單!C6', answerCell: '學習單!H6' },
      ],
    });
    expect(p.questions[2]).toMatchObject({
      label: '3',
      kind: 'SINGLE',
      parts: [{ partLabel: null, questionCell: '學習單!C11', answerCell: '學習單!G11' }],
    });
    expect(count('question_sets')).toBe(0);
  });

  it('已有題目集時 replaces 提示將被取代的來源與題數', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    const { id } = await draftWith(agent, GROUP_URL, groupAnnotations());
    const res = await preview(id);
    expect(res.body.replaces).toEqual({
      spreadsheetTitle: '軟工期末專案_單題_範例',
      sheetTitle: '學習單',
      questionCount: 6,
    });
  });
});

describe('確認匯入（FR-023、FR-025、FR-030）', () => {
  it('成功：題目集與預覽一致、試算表內容未變、寫入 metadata、記錄事件（正常）', async () => {
    const before = google.contentSnapshot(SINGLE_ID, SHEET_TITLE);
    const { id } = await draftWith(agent, SINGLE_URL, singleAnnotations());
    const previewed = (await preview(id)).body.preview;
    const res = await confirm(id);
    expect(res.status).toBe(200);
    const qs = res.body.questionSet;
    expect(qs.questionCount).toBe(6);
    expect(qs.questions).toEqual(previewed.questions);
    expect(qs.importedAt).toBe(t.clock.now().toISOString());
    expect(google.contentSnapshot(SINGLE_ID, SHEET_TITLE)).toBe(before);
    const meta = google.metadataOf(SINGLE_ID, SHEET_TITLE);
    expect(meta.filter((m) => m.key === 'qimport.set')).toHaveLength(1);
    expect(meta.filter((m) => m.key === 'qimport.row')).toHaveLength(6);
    expect(meta.filter((m) => m.key === 'qimport.col')).toHaveLength(2);
    expect(count('question_set_questions')).toBe(6);
    expect(count('answer_slots')).toBe(6);
    const events = t.db.prepare("SELECT * FROM question_events WHERE type = 'IMPORTED'").all();
    expect(events).toHaveLength(1);
    expect((await agent.get('/api/question-import/drafts/current')).body.draft).toBeNull();
  });

  it('重複確認同一草稿：回傳相同結果，不重複寫入 metadata（FR-030）', async () => {
    const { id } = await draftWith(agent, SINGLE_URL, singleAnnotations());
    const first = await confirm(id);
    const second = await confirm(id);
    expect(second.status).toBe(200);
    expect(second.body.questionSet).toEqual(first.body.questionSet);
    expect(google.batchRequests).toHaveLength(1);
  });

  it.each([
    ['修改標註格的文字', (g: FakeGoogle) => g.setCell(SINGLE_ID, SHEET_TITLE, 'C5', '改過的題目')],
    ['插入一列', (g: FakeGoogle) => g.insertRows(SINGLE_ID, SHEET_TITLE, 3, 1)],
    ['新增合併儲存格', (g: FakeGoogle) => g.addMerge(SINGLE_ID, SHEET_TITLE, 'A16', 'B16')],
  ])(
    '確認前學習單被修改（%s）→ 409 SHEET_CHANGED，題目集與 metadata 不變（FR-025）',
    async (_l, mutate) => {
      const { id } = await draftWith(agent, SINGLE_URL, singleAnnotations());
      mutate(google);
      const res = await confirm(id);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: 'SHEET_CHANGED',
        message: '學習單在標註期間被修改',
        hint: '請重新讀取並確認標註',
      });
      expect(google.metadataOf(SINGLE_ID, SHEET_TITLE)).toEqual([]);
      expect(count('question_sets')).toBe(0);
    },
  );

  it('只有檢視權限 → 403 SHEET_NO_EDIT_PERMISSION，題目集不變、草稿仍為 OPEN（US3 情境 7）', async () => {
    const { id } = await draftWith(agent, SINGLE_URL, singleAnnotations());
    google.setPermission(SINGLE_ID, 'view');
    const res = await confirm(id);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'SHEET_NO_EDIT_PERMISSION',
      message: '你連結的 Google 帳號沒有這份試算表的編輯權限，無法保存標註',
      hint: '請擁有者將你設為「編輯者」後再確認匯入',
    });
    expect(count('question_sets')).toBe(0);
    expect((await agent.get('/api/question-import/drafts/current')).body.draft.id).toBe(id);
  });

  it('寫入 metadata 時 Google 503 → 題目集不變', async () => {
    const { id } = await draftWith(agent, SINGLE_URL, singleAnnotations());
    google.failNext(503, 'UNAVAILABLE', 'batchUpdate');
    const res = await confirm(id);
    expect(res.status).toBe(503);
    expect(count('question_sets')).toBe(0);
  });

  it('未完成的草稿不能確認 → 422', async () => {
    const { id } = await draftWith(agent, SINGLE_URL, [question('qa01', 'SINGLE', [['C5', null]])]);
    expect((await confirm(id)).status).toBe(422);
    expect(google.batchRequests).toHaveLength(0);
  });

  it('已有 6 題時匯入 4 題 → 完整取代', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    await importSheet(agent, GROUP_URL, groupAnnotations());
    expect(count('question_sets')).toBe(1);
    expect(count('question_set_questions')).toBe(4);
    expect(count('answer_slots')).toBe(6);
    const qs = (await agent.get('/api/question-set')).body.questionSet;
    expect(qs.source.spreadsheetId).toBe(GROUP_ID);
  });

  it('作答格原有的文字不會被保存，只記錄已有內容（FR-022、US3 情境 8）', async () => {
    google.setCell(SINGLE_ID, SHEET_TITLE, 'G5', '老師預先填的正確答案');
    const { questionSet } = await importSheet(agent, SINGLE_URL, singleAnnotations());
    expect(questionSet.questions[0].parts[0].answerHasContent).toBe(true);
    const dump = JSON.stringify([
      t.db.prepare('SELECT * FROM answer_slots').all(),
      t.db.prepare('SELECT * FROM question_set_questions').all(),
      t.db.prepare('SELECT * FROM question_sets').all(),
    ]);
    expect(dump).not.toContain('老師預先填的正確答案');
    const slot = t.db
      .prepare('SELECT answer_had_content AS h FROM answer_slots WHERE answer_cell = ?')
      .get('G5');
    expect(slot).toEqual({ h: 1 });
  });

  it('學生呼叫預覽／確認 → 403', async () => {
    const { id } = await draftWith(agent, SINGLE_URL, singleAnnotations());
    await seedStudent(t, 'S1110001');
    const student = await loginStudent(t, 'S1110001');
    expect((await student.post(`/api/question-import/drafts/${id}/preview`)).status).toBe(403);
    expect((await student.post(`/api/question-import/drafts/${id}/confirm`)).status).toBe(403);
  });
});

describe('SC-004：版面變化都能正確匯入', () => {
  const cases: [
    string,
    ReturnType<typeof oneQuestion>,
    AnnotatedQuestion[],
    number,
    [string, string][],
  ][] = [
    ['只有 1 題', oneQuestion(), [question('qv01', 'SINGLE', [['A1', 'B1']])], 1, [['A1', 'B1']]],
    [
      '50 題',
      fiftyQuestions(),
      Array.from({ length: 50 }, (_, i) =>
        question(`qv${String(i).padStart(3, '0')}`, 'SINGLE', [[`B${i + 2}`, `C${i + 2}`]]),
      ),
      50,
      [['B2', 'C2']],
    ],
    [
      '單題與題組（含共同題幹）混合',
      mixedWithStem(),
      [
        question(
          'qv01',
          'GROUP',
          [
            ['A2', 'B2'],
            ['A3', 'B3'],
            ['A4', 'B4'],
          ],
          'A1',
        ),
        question('qv02', 'SINGLE', [['A6', 'B6']]),
      ],
      2,
      [
        ['A2', 'B2'],
        ['A3', 'B3'],
      ],
    ],
    [
      '作答欄在題目欄左側',
      answerLeftOfQuestion(),
      [question('qv01', 'SINGLE', [['D3', 'B3']]), question('qv02', 'SINGLE', [['E5', 'B5']])],
      2,
      [['D3', 'B3']],
    ],
    [
      '作答格為合併格',
      mergedAnswer(),
      [question('qv01', 'SINGLE', [['A1', 'C2']])],
      1,
      [['A1', 'B1']],
    ],
  ];

  it.each(cases)('%s', async (_l, sheet, questions, expectedCount, expectedCells) => {
    google.addSpreadsheet(sheet);
    const { questionSet } = await importSheet(agent, variantUrl(sheet.id), questions);
    expect(questionSet.questionCount).toBe(expectedCount);
    const cells = questionSet.questions[0].parts.map(
      (p: { questionCell: string; answerCell: string }) => [
        p.questionCell.split('!')[1],
        p.answerCell.split('!')[1],
      ],
    );
    expect(cells.slice(0, expectedCells.length)).toEqual(expectedCells);
  });

  it('含 3 個分頁：只匯入指定分頁', async () => {
    google.addSpreadsheet(multiTab());
    const { questionSet } = await importSheet(agent, variantUrl(multiTab().id, 22), [
      question('qv01', 'SINGLE', [['A1', 'B1']]),
      question('qv02', 'SINGLE', [['A2', 'B2']]),
    ]);
    expect(questionSet.source.sheetTitle).toBe('第二單元');
    expect(questionSet.questions[1].parts[0].answerCell).toBe('第二單元!B2');
    expect(google.metadataOf(multiTab().id, '說明')).toEqual([]);
  });
});
