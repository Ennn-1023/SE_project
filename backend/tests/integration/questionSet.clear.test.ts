/** US5：清除題目集（DELETE /api/question-set）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import type request from 'supertest';
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

const count = (table: string) =>
  (t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('DELETE /api/question-set', () => {
  it('刪除題目集、題目與作答項目，記錄 CLEARED；試算表上的標註保留（正常）', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    const metaBefore = google.metadataOf(SINGLE_ID, SHEET_TITLE).length;
    const res = await agent.delete('/api/question-set');
    expect(res.status).toBe(204);
    expect(count('question_sets')).toBe(0);
    expect(count('question_set_questions')).toBe(0);
    expect(count('answer_slots')).toBe(0);
    expect((await agent.get('/api/question-set')).body).toEqual({ questionSet: null });
    expect(google.metadataOf(SINGLE_ID, SHEET_TITLE)).toHaveLength(metaBefore);
    const last = t.db.prepare('SELECT * FROM question_events ORDER BY id DESC LIMIT 1').get() as {
      type: string;
      question_count: number;
    };
    expect(last).toMatchObject({ type: 'CLEARED', question_count: 6 });
  });

  it('沒有題目集時亦回 204，不記錄事件（邊界）', async () => {
    const before = count('question_events');
    expect((await agent.delete('/api/question-set')).status).toBe(204);
    expect(count('question_events')).toBe(before);
  });

  it('清除後再讀取同一份學習單仍可帶回標註', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    await agent.delete('/api/question-set');
    const res = await agent.post('/api/question-import/drafts').send({ link: SINGLE_URL });
    expect(res.body.draft.restoredCount).toBe(6);
  });

  it('中斷 Google 連結不影響已匯入的題目集', async () => {
    await importSheet(agent, SINGLE_URL, singleAnnotations());
    await agent.delete('/api/google/connection');
    expect((await agent.get('/api/question-set')).body.questionSet.questionCount).toBe(6);
  });

  it('學生呼叫 → 403；未登入 → 401', async () => {
    await seedStudent(t, 'S1110001');
    const student = await loginStudent(t, 'S1110001');
    expect((await student.delete('/api/question-set')).status).toBe(403);
    expect((await t.request().delete('/api/question-set')).status).toBe(401);
  });
});
