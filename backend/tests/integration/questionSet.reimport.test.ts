/** US4：重新匯入同一份學習單時帶回標註（diagrams/003-sequence-reimport.puml；FR-024、SC-005）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import type request from 'supertest';
import type { AnnotatedQuestion, Issue } from '@buzzer/shared';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
import { importSheet, singleAnnotations } from '../helpers/annotations.js';
import {
  connectGoogle,
  createTestApp,
  loginStudent,
  loginTeacher,
  seedStudent,
  type TestApp,
} from '../helpers/testApp.js';
import {
  SHEET_TITLE,
  SINGLE_ID,
  SINGLE_URL,
  singleSheet,
} from '../fixtures/google/single-sheet.js';

let google: FakeGoogle;
let t: TestApp;
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  google = new FakeGoogle().addSpreadsheet(singleSheet());
  t = await createTestApp({ google });
  agent = await loginTeacher(t);
  await connectGoogle(google, agent);
});

const reimport = () => agent.post('/api/question-set/reimport');
const cellsOf = (questions: AnnotatedQuestion[]) =>
  questions.map((q) => [q.parts[0]!.questionCell, q.parts[0]!.answerCell]);

describe('POST /api/question-set/reimport', () => {
  it('沒有題目集 → 404「目前沒有題目集可重新匯入」', async () => {
    const res = await reimport();
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('目前沒有題目集可重新匯入');
  });

  it('帶回上次的標註：restoredCount 等於題數、記錄 REIMPORTED（正常）', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    const res = await reimport();
    expect(res.status).toBe(201);
    const { draft } = res.body;
    expect(draft.restoredCount).toBe(6);
    expect(draft.annotations.questions.map((q: AnnotatedQuestion) => q.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(cellsOf(draft.annotations.questions)).toEqual(
      [5, 7, 9, 11, 13, 15].map((r) => [`C${r}`, `G${r}`]),
    );
    expect(draft.validation.issues).toEqual([]);
    const types = t.db.prepare('SELECT type FROM question_events ORDER BY id').all();
    expect(types.at(-1)).toEqual({ type: 'REIMPORTED' });
  });

  it('SC-005：插入 2 列並新增第 7 題後重新匯入，既有標註順延 2 列', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    google.insertRows(SINGLE_ID, SHEET_TITLE, 3, 2);
    google.setCell(SINGLE_ID, SHEET_TITLE, 'C19', '新增的第 7 題？');
    const { draft } = (await reimport()).body;
    expect(cellsOf(draft.annotations.questions)).toEqual(
      [7, 9, 11, 13, 15, 17].map((r) => [`C${r}`, `G${r}`]),
    );
    expect(draft.grid.cells.some((c: { ref: string }) => c.ref === 'C19')).toBe(true);
    expect(draft.restoredCount).toBe(6);
  });

  it('刪除作答欄後重新匯入，相關題目出現提醒並標為未完成（US4 情境 3）', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    google.deleteColumns(SINGLE_ID, SHEET_TITLE, 7, 1); // G 欄
    const { draft } = (await reimport()).body;
    expect(draft.annotations.questions[0].parts[0].answerCell).toBeNull();
    const missing = draft.validation.warnings.filter(
      (w: Issue) => w.code === 'RESTORED_CELL_MISSING',
    );
    expect(missing).toHaveLength(6);
    expect(missing[0].message).toBe('第 1 題的作答格已不存在，請重新指定');
    const preview = await agent.post(`/api/question-import/drafts/${draft.id}/preview`);
    expect(preview.status).toBe(422);
  });

  it('答案已寫入作答格後，重新匯入仍帶回標註並提醒作答格已有內容（US4 情境 4）', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    google.setCell(SINGLE_ID, SHEET_TITLE, 'G5', '第 1 組的答案');
    const { draft } = (await reimport()).body;
    expect(draft.annotations.questions[0].parts[0].answerCell).toBe('G5');
    expect(draft.validation.warnings.map((w: Issue) => w.code)).toContain('ANSWER_HAS_CONTENT');
  });

  it('以 POST /question-import/drafts 貼上同一連結也會帶回標註', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    const res = await agent.post('/api/question-import/drafts').send({ link: SINGLE_URL });
    expect(res.body.draft.restoredCount).toBe(6);
  });

  it('帶回後可直接再次確認匯入（metadata 指紋與讀取當下一致）', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    const { draft } = (await reimport()).body;
    const res = await agent.post(`/api/question-import/drafts/${draft.id}/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.questionSet.questionCount).toBe(6);
  });

  it('學生呼叫 → 403', async () => {
    await seedStudent(t, 'S1110001');
    const student = await loginStudent(t, 'S1110001');
    expect((await student.post('/api/question-set/reimport')).status).toBe(403);
  });
});
