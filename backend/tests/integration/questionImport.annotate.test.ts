/** US2：儲存標註（PUT /api/question-import/drafts/:id/annotations；FR-013～FR-021）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import type request from 'supertest';
import type { AnnotatedQuestion } from '@buzzer/shared';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
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
let draftId: string;

beforeEach(async () => {
  google = new FakeGoogle().addSpreadsheet(groupSheet());
  t = await createTestApp({ google });
  agent = await loginTeacher(t);
  await connectGoogle(google, agent);
  draftId = (await agent.post('/api/question-import/drafts').send({ link: GROUP_URL })).body.draft
    .id;
});

const q = (
  key: string,
  kind: 'SINGLE' | 'GROUP',
  parts: [string | null, string | null][],
  over: Partial<AnnotatedQuestion> = {},
): AnnotatedQuestion => ({
  key,
  label: '',
  labelManual: false,
  kind,
  stemCell: null,
  parts: parts.map(([questionCell, answerCell]) => ({ questionCell, answerCell })),
  ...over,
});

const save = (revision: number, questions: AnnotatedQuestion[], id = draftId) =>
  agent
    .put(`/api/question-import/drafts/${id}/annotations`)
    .send({ revision, annotations: { questions } });

describe('儲存標註', () => {
  it('儲存成功：revision +1、自動題號、合併格正規化、延長期限（正常）', async () => {
    t.clock.advance(10 * 60_000);
    const res = await save(0, [
      q('qa01', 'GROUP', [
        ['E5', 'H5'],
        ['C6', 'H6'],
      ]),
      q('qa02', 'SINGLE', [['C11', 'H11']]),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.revision).toBe(1);
    expect(res.body.annotations.questions.map((x: AnnotatedQuestion) => x.label)).toEqual([
      '1',
      '2',
    ]);
    expect(res.body.annotations.questions[0].parts[0].questionCell).toBe('C5');
    expect(res.body.annotations.questions[1].parts[0].answerCell).toBe('G11');
    expect(res.body.validation.issues).toEqual([]);
    expect(new Date(res.body.expiresAt).getTime()).toBe(t.clock.now().getTime() + 30 * 60_000);
    const current = await agent.get('/api/question-import/drafts/current');
    expect(current.body.draft.revision).toBe(1);
    expect(current.body.draft.annotations.questions).toHaveLength(2);
  });

  it('結構性錯誤仍保存並回報 issues；未完成的題目不在此回報', async () => {
    const res = await save(0, [
      q('qa01', 'SINGLE', [['C5', 'H5']]),
      q('qa02', 'SINGLE', [['C6', 'H5']]),
      q('qa03', 'SINGLE', [['C8', null]]),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.validation.issues.map((i: { code: string }) => i.code)).toEqual([
      'CELL_ROLE_CONFLICT',
    ]);
    expect(res.body.revision).toBe(1);
  });

  it.each([
    [
      '201 題',
      Array.from({ length: 201 }, (_, i) =>
        q(`k${String(i).padStart(4, '0')}`, 'SINGLE', [[null, null]]),
      ),
    ],
    [
      '11 個小題',
      [
        q(
          'qa01',
          'GROUP',
          Array.from({ length: 11 }, (): [null, null] => [null, null]),
        ),
      ],
    ],
    ['key 格式錯誤', [q('bad key!', 'SINGLE', [[null, null]])]],
    ['CellRef 格式錯誤', [q('qa01', 'SINGLE', [['g5', null]])]],
  ])('%s → 400 不保存（邊界）', async (_l, questions) => {
    const res = await save(0, questions as AnnotatedQuestion[]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const current = await agent.get('/api/question-import/drafts/current');
    expect(current.body.draft.revision).toBe(0);
  });

  it('revision 不符 → 409 DRAFT_REVISION_CONFLICT（附目前 revision）', async () => {
    await save(0, [q('qa01', 'SINGLE', [['C5', 'H5']])]);
    const res = await save(0, [q('qa01', 'SINGLE', [['C6', 'H6']])]);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'DRAFT_REVISION_CONFLICT',
      message: '此學習單已在其他視窗修改',
      details: { revision: 1 },
    });
  });

  it('超過 30 分鐘未儲存 → 410 DRAFT_EXPIRED（邊界）', async () => {
    t.clock.advance(31 * 60_000);
    const res = await save(0, []);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatchObject({ code: 'DRAFT_EXPIRED', hint: '請重新讀取學習單' });
  });

  it('不存在或已取消的草稿 → 404；草稿 id 不是 UUID → 400', async () => {
    expect((await save(0, [], '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    await agent.delete(`/api/question-import/drafts/${draftId}`);
    expect((await save(0, [])).status).toBe(404);
    expect((await save(0, [], 'abc')).status).toBe(400);
  });

  it('超過 100 KB 的標註文件仍可接受（200 題、各 10 小題）', async () => {
    const big = Array.from({ length: 200 }, (_, i) =>
      q(
        `k${String(i).padStart(4, '0')}`,
        'GROUP',
        Array.from({ length: 10 }, (): [string, string] => ['AZ499', 'AY499']),
        { label: `第${i}題超長題號`.slice(0, 20), labelManual: true },
      ),
    );
    const res = await save(0, big);
    expect(res.status).toBe(200);
    expect(JSON.stringify({ questions: big }).length).toBeGreaterThan(100_000);
  });

  it('學生呼叫 → 403', async () => {
    await seedStudent(t, 'S1110001');
    const student = await loginStudent(t, 'S1110001');
    const res = await student
      .put(`/api/question-import/drafts/${draftId}/annotations`)
      .send({ revision: 0, annotations: { questions: [] } });
    expect(res.status).toBe(403);
  });
});
