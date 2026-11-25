/** US3：檢視目前題目集（GET /api/question-set；FR-029）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import type request from 'supertest';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
import { groupAnnotations, importSheet, question } from '../helpers/annotations.js';
import {
  connectGoogle,
  createTestApp,
  loginStudent,
  loginTeacher,
  seedStudent,
  type TestApp,
} from '../helpers/testApp.js';
import { GROUP_URL, groupSheet } from '../fixtures/google/group-sheet.js';

let google: FakeGoogle;
let t: TestApp;
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  google = new FakeGoogle().addSpreadsheet(groupSheet());
  t = await createTestApp({ google });
  agent = await loginTeacher(t);
  await connectGoogle(google, agent);
});

describe('GET /api/question-set', () => {
  it('沒有題目集時回 null', async () => {
    const res = await agent.get('/api/question-set');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ questionSet: null });
  });

  it('回傳來源、題數、匯入時間與題目（含共同題幹、小題標籤、分頁名稱）（正常）', async () => {
    const qs = groupAnnotations();
    qs[0] = { ...qs[0]!, stemCell: 'B2' };
    await importSheet(agent, GROUP_URL, qs);
    const res = await agent.get('/api/question-set');
    const view = res.body.questionSet;
    expect(view.source).toMatchObject({
      spreadsheetTitle: '軟工期末專案_題組_範例',
      sheetTitle: '學習單',
    });
    expect(view.questionCount).toBe(4);
    expect(view.slotCount).toBe(6);
    expect(view.importedAt).toBe(t.clock.now().toISOString());
    expect(view.questions[0]).toMatchObject({
      label: '1',
      kind: 'GROUP',
      stem: { text: '虛構課程 學習單', cell: '學習單!B2' },
      parts: [{ partLabel: '（1）' }, { partLabel: '（2）' }],
    });
    expect(view.questions[3].parts[0]).toMatchObject({
      partLabel: null,
      text: '虛構題目 4：單題？',
      answerCell: '學習單!G13',
    });
  });

  it('手動題號依標註保存', async () => {
    await importSheet(agent, GROUP_URL, [
      { ...question('qg01', 'SINGLE', [['C11', 'G11']]), label: 'Q三', labelManual: true },
    ]);
    const res = await agent.get('/api/question-set');
    expect(res.body.questionSet.questions[0].label).toBe('Q三');
  });

  it('學生呼叫 → 403', async () => {
    await seedStudent(t, 'S1110001');
    const student = await loginStudent(t, 'S1110001');
    expect((await student.get('/api/question-set')).status).toBe(403);
  });
});
