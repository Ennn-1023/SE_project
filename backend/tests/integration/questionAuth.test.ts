/** FR-031／SC-008：題目匯入相關 API 只限老師使用（伺服器端檢查）。 */
import { beforeAll, describe, expect, it } from 'vitest';
import type request from 'supertest';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
import { createTestApp, loginStudent, seedStudent, type TestApp } from '../helpers/testApp.js';

const DRAFT = '11111111-1111-4111-8111-111111111111';

/** contracts/openapi.yaml 的所有端點（OAuth 回呼除外）。 */
const ENDPOINTS: [string, string, Record<string, unknown>?][] = [
  ['get', '/api/google/status'],
  ['post', '/api/google/oauth/start'],
  ['delete', '/api/google/connection'],
  ['post', '/api/question-import/drafts', { link: 'https://docs.google.com/spreadsheets/d/x' }],
  ['get', '/api/question-import/drafts/current'],
  [
    'put',
    `/api/question-import/drafts/${DRAFT}/annotations`,
    { revision: 0, annotations: { questions: [] } },
  ],
  ['post', `/api/question-import/drafts/${DRAFT}/preview`],
  ['post', `/api/question-import/drafts/${DRAFT}/confirm`],
  ['delete', `/api/question-import/drafts/${DRAFT}`],
  ['get', '/api/question-set'],
  ['delete', '/api/question-set'],
  ['post', '/api/question-set/reimport'],
];

let t: TestApp;
let student: ReturnType<typeof request.agent>;

beforeAll(async () => {
  t = await createTestApp({ google: new FakeGoogle() });
  await seedStudent(t, 'S1110001');
  student = await loginStudent(t, 'S1110001');
});

type Method = 'get' | 'post' | 'put' | 'delete';

describe('題目匯入 API 的權限', () => {
  it.each(ENDPOINTS)('學生 %s %s → 403 FORBIDDEN', async (method, url, body) => {
    const req = student[method as Method](url);
    const res = body ? await req.send(body) : await req;
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('此功能僅限老師使用');
  });

  it.each(ENDPOINTS)('未登入 %s %s → 401 UNAUTHENTICATED', async (method, url, body) => {
    const req = t.request()[method as Method](url);
    const res = body ? await req.send(body) : await req;
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('學生的操作不會改變任何資料', () => {
    for (const table of ['google_connections', 'oauth_states', 'import_drafts', 'question_sets']) {
      expect(t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
  });
});
