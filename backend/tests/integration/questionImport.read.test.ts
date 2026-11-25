/** US1：讀取學習單並建立標註草稿（POST /api/question-import/drafts）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import type request from 'supertest';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
import {
  connectGoogle,
  createTestApp,
  loginStudent,
  loginTeacher,
  seedStudent,
  type TestApp,
} from '../helpers/testApp.js';
import { SINGLE_GID, SINGLE_ID, SINGLE_URL, singleSheet } from '../fixtures/google/single-sheet.js';
import { fiftyQuestions, multiTab, variantUrl } from '../fixtures/google/variants.js';

let google: FakeGoogle;
let t: TestApp;
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  google = new FakeGoogle().addSpreadsheet(singleSheet()).addSpreadsheet(multiTab());
  t = await createTestApp({ google });
  agent = await loginTeacher(t);
  await connectGoogle(google, agent);
});

const createDraft = (body: Record<string, unknown>) =>
  agent.post('/api/question-import/drafts').send(body);

describe('讀取學習單（FR-005、FR-011）', () => {
  it('單題範例 → 201 草稿：格子含合併 C5:F5、尚無標註（正常）', async () => {
    const res = await createDraft({ link: SINGLE_URL });
    expect(res.status).toBe(201);
    const { draft } = res.body;
    expect(draft.source).toMatchObject({
      spreadsheetId: SINGLE_ID,
      spreadsheetTitle: '軟工期末專案_單題_範例',
      sheetId: SINGLE_GID,
      sheetTitle: '學習單',
      sourceUrl: SINGLE_URL,
    });
    expect(draft.grid.merges).toContainEqual({ start: 'C5', end: 'F5' });
    expect(draft.grid.cells.find((c: { ref: string }) => c.ref === 'C5').text).toContain(
      '虛構題目 1',
    );
    // 使用範圍 15×7，加上可點選的空白邊界（作答欄 H 也在範圍內）
    expect(draft.grid.rowCount).toBeGreaterThanOrEqual(15);
    expect(draft.grid.columnCount).toBeGreaterThanOrEqual(8);
    expect(draft.annotations).toEqual({ questions: [] });
    expect(draft.restoredCount).toBe(0);
    expect(draft.revision).toBe(0);
    expect(draft.validation).toEqual({ issues: [], warnings: [], totalIssues: 0 });
    expect(new Date(draft.expiresAt).getTime() - t.clock.now().getTime()).toBe(30 * 60_000);
    // 尚未保存任何題目
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM question_sets').get()).toEqual({ n: 0 });
  });

  it('連結中的 gid 選擇分頁；sheetId 參數優先；沒有 gid 時預設第一個分頁並回傳分頁清單', async () => {
    const id = multiTab().id;
    const byGid = await createDraft({ link: variantUrl(id, 22) });
    expect(byGid.body.draft.source.sheetTitle).toBe('第二單元');
    const bySheetId = await createDraft({ link: variantUrl(id, 22), sheetId: 11 });
    expect(bySheetId.body.draft.source.sheetTitle).toBe('第一單元');
    const noGid = await createDraft({ link: `https://docs.google.com/spreadsheets/d/${id}/edit` });
    expect(noGid.body.draft.source.sheetTitle).toBe('說明');
    expect(noGid.body.draft.sheets).toEqual([
      { sheetId: 0, title: '說明' },
      { sheetId: 11, title: '第一單元' },
      { sheetId: 22, title: '第二單元' },
    ]);
  });

  it('建立第二份草稿時第一份改為 CANCELLED', async () => {
    const first = (await createDraft({ link: SINGLE_URL })).body.draft.id;
    const second = (await createDraft({ link: SINGLE_URL })).body.draft.id;
    const rows = t.db.prepare('SELECT id, status FROM import_drafts ORDER BY created_at').all();
    expect(rows).toContainEqual({ id: first, status: 'CANCELLED' });
    expect(rows).toContainEqual({ id: second, status: 'OPEN' });
    const current = await agent.get('/api/question-import/drafts/current');
    expect(current.body.draft.id).toBe(second);
  });

  it('GET /drafts/current：過期後回 null；DELETE 取消草稿', async () => {
    const id = (await createDraft({ link: SINGLE_URL })).body.draft.id;
    expect((await agent.delete(`/api/question-import/drafts/${id}`)).status).toBe(204);
    expect((await agent.get('/api/question-import/drafts/current')).body).toEqual({
      draft: null,
    });
    await createDraft({ link: SINGLE_URL });
    t.clock.advance(31 * 60_000);
    expect((await agent.get('/api/question-import/drafts/current')).body).toEqual({
      draft: null,
    });
    expect((await agent.delete('/api/question-import/drafts/not-a-uuid')).status).toBe(400);
  });
});

describe('連結驗證與 Google 錯誤（FR-008、FR-009）', () => {
  it.each([
    'https://example.com/x',
    `https://docs.google.com/document/d/${SINGLE_ID}/edit`,
    '學習單',
  ])('不是試算表連結 %s → 400 SHEET_LINK_INVALID，不呼叫 Google（邊界）', async (link) => {
    const before = google.calls.length;
    const res = await createDraft({ link });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'SHEET_LINK_INVALID',
      field: 'link',
      message: '請貼上 Google 試算表連結',
    });
    expect(google.calls.length).toBe(before);
  });

  it('link 缺漏、空白或超過 2,000 字元 → 400（邊界）', async () => {
    expect((await createDraft({})).status).toBe(400);
    expect((await createDraft({ link: '' })).status).toBe(400);
    expect((await createDraft({ link: `${SINGLE_URL}#${'x'.repeat(2000)}` })).status).toBe(400);
    expect((await createDraft({ link: SINGLE_URL, sheetId: -1 })).status).toBe(400);
  });

  it('尚未連結 Google → 409 GOOGLE_NOT_CONNECTED', async () => {
    await agent.delete('/api/google/connection');
    const res = await createDraft({ link: SINGLE_URL });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GOOGLE_NOT_CONNECTED');
  });

  it('FR-004：access token 即將到期時自動更新，老師不受打擾（正常）', async () => {
    const before = t.db.prepare('SELECT access_token_enc AS a FROM google_connections').get() as {
      a: string;
    };
    t.clock.advance(3600_000 - 30_000); // 剩 30 秒
    const res = await createDraft({ link: SINGLE_URL });
    expect(res.status).toBe(201);
    expect(google.calls.filter((c) => c === 'refresh')).toHaveLength(1);
    const after = t.db
      .prepare('SELECT access_token_enc AS a, access_token_expires_at AS e FROM google_connections')
      .get() as { a: string; e: string };
    expect(after.a).not.toBe(before.a);
    expect(new Date(after.e).getTime()).toBe(t.clock.now().getTime() + 3600_000);
  });

  it('授權已失效（refresh 回 invalid_grant）→ 409 GOOGLE_AUTH_EXPIRED 並刪除連結（邊界）', async () => {
    google.invalidateRefreshTokens();
    t.clock.advance(3600_000 - 10_000); // 需要更新 token（登入 session 仍有效）
    const res = await createDraft({ link: SINGLE_URL });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'GOOGLE_AUTH_EXPIRED',
      message: 'Google 帳號授權已失效',
      hint: '請重新連結 Google 帳號',
    });
    expect((await agent.get('/api/google/status')).body.connected).toBe(false);
  });

  it('access token 被 Google 拒絕（401）時更新後重試一次成功', async () => {
    google.expireAccessTokens();
    const res = await createDraft({ link: SINGLE_URL });
    expect(res.status).toBe(201);
    expect(google.calls.filter((c) => c === 'refresh')).toHaveLength(1);
  });

  it.each([
    [403, 403, 'SHEET_FORBIDDEN', '你連結的 Google 帳號沒有這份試算表的檢視權限'],
    [404, 404, 'SHEET_NOT_FOUND', '找不到這份試算表'],
    [429, 503, 'GOOGLE_RATE_LIMITED', '暫時無法連線到 Google 試算表'],
    [500, 503, 'GOOGLE_UNAVAILABLE', '暫時無法連線到 Google 試算表'],
    [0, 503, 'GOOGLE_UNAVAILABLE', '暫時無法連線到 Google 試算表'],
  ])('Google 回 %i → %i %s（邊界）', async (gStatus, status, code, message) => {
    google.failNext(gStatus, 'X', 'getSpreadsheet');
    const res = await createDraft({ link: SINGLE_URL });
    expect(res.status).toBe(status);
    expect(res.body.error).toMatchObject({ code, message });
  });

  it('上傳的 Excel 等非原生試算表（Google 400 FAILED_PRECONDITION）→ 422 SHEET_NOT_NATIVE', async () => {
    google.failNext(400, 'FAILED_PRECONDITION', 'getSpreadsheet');
    const res = await createDraft({ link: SINGLE_URL });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'SHEET_NOT_NATIVE',
      message: '這個檔案不是 Google 試算表格式（可能是上傳的 Excel 檔）',
    });
  });

  it('沒有檢視權限（實際權限）→ 403 SHEET_FORBIDDEN', async () => {
    google.setPermission(SINGLE_ID, 'none');
    const res = await createDraft({ link: SINGLE_URL });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SHEET_FORBIDDEN');
  });

  it('分頁不存在 → 404 SHEET_TAB_NOT_FOUND，附可選分頁', async () => {
    const res = await createDraft({ link: variantUrl(multiTab().id, 999) });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SHEET_TAB_NOT_FOUND');
    expect(res.body.error.details.sheets).toHaveLength(3);
  });

  it('空白分頁 → 422 SHEET_EMPTY', async () => {
    google.addSpreadsheet({
      id: 'fakeEmptySheet0000000000000001',
      title: '空白',
      sheets: [{ sheetId: 0, title: '工作表1', cells: {} }],
    });
    const res = await createDraft({ link: variantUrl('fakeEmptySheet0000000000000001') });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'SHEET_EMPTY', message: '這個分頁是空的' });
  });

  it.each([
    ['501 列', { A501: 'x' }],
    ['53 欄', { BA1: 'x' }],
  ])('使用範圍 %s → 422 SHEET_TOO_LARGE（邊界）', async (_l, cells) => {
    google.addSpreadsheet({
      id: 'fakeLargeSheet0000000000000001',
      title: '過大',
      sheets: [{ sheetId: 0, title: '工作表1', cells: { A1: 'x', ...cells } }],
    });
    const res = await createDraft({ link: variantUrl('fakeLargeSheet0000000000000001') });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SHEET_TOO_LARGE');
    expect(res.body.error.message).toMatch(/\d+ 列 × \d+ 欄/);
  });

  it('500 列 × 52 欄剛好可讀取（邊界）', async () => {
    google.addSpreadsheet({
      id: 'fakeMaxSheet000000000000000001',
      title: '上限',
      sheets: [{ sheetId: 0, title: '工作表1', cells: { A1: 'x', AZ500: 'y' } }],
    });
    const res = await createDraft({ link: variantUrl('fakeMaxSheet000000000000000001') });
    expect(res.status).toBe(201);
    expect(res.body.draft.grid.rowCount).toBe(500);
    expect(res.body.draft.grid.columnCount).toBe(52);
  });
});

describe('效能與權限', () => {
  it('SC-003：Google 每次呼叫延遲 500 ms，50 題學習單 5 秒內完成讀取', async () => {
    google.addSpreadsheet(fiftyQuestions());
    google.delayMs = 500;
    const started = Date.now();
    const res = await createDraft({ link: variantUrl(fiftyQuestions().id) });
    expect(res.status).toBe(201);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('學生呼叫匯入 API 一律 403（FR-031）', async () => {
    await seedStudent(t, 'S1110001');
    const student = await loginStudent(t, 'S1110001');
    expect(
      (await student.post('/api/question-import/drafts').send({ link: SINGLE_URL })).status,
    ).toBe(403);
    expect((await student.get('/api/question-import/drafts/current')).status).toBe(403);
  });
});
