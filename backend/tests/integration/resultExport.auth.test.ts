/** 寫回與匯出只限老師（005 FR-004、US1-7、US3-8、SC-008）。資料皆為虛構。 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWritebackServer, type WritebackServer } from '../helpers/activity';

let s: WritebackServer;
let studentCookie: string;

beforeAll(async () => {
  s = await startWritebackServer();
  await s.t.answer(1, [['S201', ['不可外洩的答案']]]);
  studentCookie = await s.t.loginAs('S101');
});
afterAll(async () => {
  await s?.t.stop();
});

const calls = {
  preview: (cookie?: string) => {
    const r = s.t.http.post('/api/teacher/activity/writeback/preview');
    return cookie ? r.set('Cookie', cookie) : r;
  },
  confirm: (cookie?: string) => {
    const r = s.t.http.post('/api/teacher/activity/writeback/confirm');
    return (cookie ? r.set('Cookie', cookie) : r).send({ previewId: 'AAAAAAAAAAAA' });
  },
  csv: (cookie?: string) => {
    const r = s.t.http.get('/api/teacher/activity/export.csv');
    return cookie ? r.set('Cookie', cookie) : r;
  },
};

describe.each(Object.entries(calls))('%s', (_name, call) => {
  it('學生 → 403「權限不足」，不含任何結果資料、試算表未被修改', async () => {
    const before = s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle);
    const res = await call(studentCookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'FORBIDDEN', message: '權限不足' });
    expect(res.text).not.toContain('不可外洩的答案');
    expect(res.headers['content-type']).toContain('application/json');
    expect(s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle)).toBe(before);
    expect(s.google.calls).not.toContain('updateValues');
  });

  it('未登入 → 401 要求登入（邊界）', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.text).not.toContain('不可外洩的答案');
  });
});
