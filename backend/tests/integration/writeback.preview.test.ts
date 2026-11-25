/**
 * 寫回預覽（005 US1、US4、US5；FR-006～FR-011、FR-016）。
 * 以 FakeGoogle 模擬學習單；學生、組別、答案皆為虛構。預覽一律不修改試算表。
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { WritebackPreviewView } from '@buzzer/shared';
import { startWritebackServer, type WritebackServer } from '../helpers/activity';

let s: WritebackServer;
afterEach(async () => {
  await s?.t.stop();
});

/** 第 1～4 題由不同組成功、第 5 題無人送出、第 6 題未開放（spec US1 Independent Test） */
async function playSingle(x: WritebackServer) {
  await x.t.answer(1, [
    ['S201', ['第 2 組答案一']],
    ['S101', ['第 1 組答案一']],
  ]);
  await x.t.answer(2, [['S301', ['第 3 組答案二']]]);
  await x.t.answer(3, [['S401', ['第 4 組答案三']]]);
  await x.t.answer(4, [['S101', ['第 1 組答案四']]]);
  await x.t.answer(5, []);
}

const preview = async (x: WritebackServer) => {
  const res = await x.wb.preview();
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as WritebackPreviewView;
};

describe('寫回預覽（US1）', () => {
  it('列出 4 筆將寫入的項目與 2 題不寫入原因，不修改試算表（US1-1）', async () => {
    s = await startWritebackServer();
    await playSingle(s);
    const before = s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle);
    const v = await preview(s);
    expect(v.previewId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(v.target).toMatchObject({
      spreadsheetTitle: '軟工期末專案_單題_範例',
      sheetTitle: '學習單',
    });
    expect(v.target.url).toContain('fakeSingleSheet');
    expect(
      v.items.map((i) => [i.questionNumber, i.cell, i.winnerTeamName, i.answer, i.status]),
    ).toEqual([
      ['1', 'G5', '第 2 組', '第 2 組答案一', 'EMPTY'],
      ['2', 'G7', '第 3 組', '第 3 組答案二', 'EMPTY'],
      ['3', 'G9', '第 4 組', '第 4 組答案三', 'EMPTY'],
      ['4', 'G11', '第 1 組', '第 1 組答案四', 'EMPTY'],
    ]);
    expect(v.skipped).toEqual([
      { questionNumber: '5', reason: 'NO_WINNER' },
      { questionNumber: '6', reason: 'NOT_OPENED' },
    ]);
    expect(v.summary).toEqual({
      emptyCount: 4,
      overwriteCount: 0,
      sameCount: 0,
      unresolvedCount: 0,
      skippedQuestionCount: 2,
    });
    expect(s.google.calls).not.toContain('updateValues');
    expect(s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle)).toBe(before);
  });

  it('題組各小題對應各自作答格，不交錯（US1-3）', async () => {
    s = await startWritebackServer('group');
    await s.t.answer(1, [['S201', ['小題一答案', '小題二答案']]]);
    const v = await preview(s);
    expect(v.items.map((i) => [i.questionNumber, i.partLabel, i.cell, i.answer])).toEqual([
      ['1', '（1）', 'H5', '小題一答案'],
      ['1', '（2）', 'H6', '小題二答案'],
    ]);
    // 題組範例的作答格在 H 欄，原本為空白
    expect(v.items.every((i) => i.status === 'EMPTY')).toBe(true);
  });

  it('學習單插入列後依標註找到新位置（US1-4、FR-009）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案一']]]);
    await s.t.answer(2, [['S301', ['答案二']]]);
    s.google.insertRows(s.spreadsheetId, s.sheetTitle, 5, 2);
    const v = await preview(s);
    expect(v.items.map((i) => i.cell)).toEqual(['G7', 'G9']);
    expect(v.items[0]!.fallbackCell).toBe('G5');
  });

  it('重新開放的題目只用新一輪的成功組別，作廢輪次不出現（US1-5）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['舊答案']]]);
    await s.t.answer(1, [['S301', ['新答案']]], { reopen: true });
    const v = await preview(s);
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ winnerTeamName: '第 3 組', answer: '新答案' });
    expect(JSON.stringify(v)).not.toContain('舊答案');
  });

  it('分頁改名後仍依分頁識別找到，預覽顯示目前名稱（Edge Case）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    s.google.renameSheet(s.spreadsheetId, s.sheetTitle, '第一週學習單');
    const v = await preview(s);
    expect(v.target.sheetTitle).toBe('第一週學習單');
    expect(v.items[0]!.cell).toBe('G5');
  });

  it('作答格在隱藏列時照常列出並標示 hidden（FR-006）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    s.google.hideRows(s.spreadsheetId, s.sheetTitle, [5]);
    const v = await preview(s);
    expect(v.items[0]).toMatchObject({ cell: 'G5', hidden: true, status: 'EMPTY' });
  });
});

describe('入口、時機與錯誤（US4）', () => {
  it('作答中的題目不納入，列為 ANSWERING（US4-1、FR-002）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案一']]]);
    await s.t.answer(2, [['S301', ['答案二']]]);
    await s.t.answer(3, [['S401', ['作答中的答案']]], { close: false });
    const v = await preview(s);
    expect(v.items.map((i) => i.questionNumber)).toEqual(['1', '2']);
    expect(v.skipped).toContainEqual({ questionNumber: '3', reason: 'ANSWERING' });
    expect(JSON.stringify(v)).not.toContain('作答中的答案');
  });

  it('從未開始活動 → 404 NO_ACTIVITY_RESULTS（US4-2）', async () => {
    s = await startWritebackServer('single', { start: false });
    const res = await s.wb.preview();
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'NO_ACTIVITY_RESULTS',
      message: '尚無搶答活動結果可寫回或匯出',
    });
  });

  it('沒有任何搶答成功組別 → 409 WRITEBACK_NOTHING_TO_WRITE，不讀取試算表（US4-3）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, []);
    const callsBefore = s.google.calls.length;
    const res = await s.wb.preview();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'WRITEBACK_NOTHING_TO_WRITE',
      message: '本場活動沒有搶答成功的答案可寫回',
    });
    expect(s.google.calls.length).toBe(callsBefore);
  });

  it('沒有記錄來源試算表的活動（v5 前或非匯入）→ 409 WRITEBACK_NO_SOURCE', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    s.t.db
      .prepare(
        `UPDATE activities SET spreadsheet_id = NULL, spreadsheet_title = NULL, sheet_id = NULL,
           sheet_title = NULL, source_url = NULL`,
      )
      .run();
    const res = await s.wb.preview();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WRITEBACK_NO_SOURCE');
    expect(res.body.error.message).toBe('本場活動沒有記錄來源試算表，無法寫回');
    expect(res.body.error.hint).toContain('寫回功能上線前開始的活動');
    expect(res.body.error.hint).toContain('匯出結果 CSV');
  });

  it('尚未連結 Google → 409 GOOGLE_NOT_CONNECTED「請先連結 Google 帳號」（US4-4）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    expect((await s.agent.delete('/api/google/connection')).status).toBe(204);
    const res = await s.wb.preview();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'GOOGLE_NOT_CONNECTED',
      message: '請先連結 Google 帳號',
    });
  });

  it('授權失效 → 409 GOOGLE_AUTH_EXPIRED（US4-4）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    s.google.expireAccessTokens();
    s.google.invalidateRefreshTokens();
    const res = await s.wb.preview();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'GOOGLE_AUTH_EXPIRED',
      message: 'Google 帳號授權已失效，請重新連結 Google 帳號',
    });
  });

  it('試算表已被刪除 → 404 SHEET_NOT_FOUND（US4-6）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    s.google.failNext(404, 'NOT_FOUND', 'getSpreadsheet');
    const res = await s.wb.preview();
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'SHEET_NOT_FOUND',
      message: '找不到這份試算表，可能已被刪除或移除共用',
    });
  });

  it('學習單分頁找不到 → 404 SHEET_TAB_NOT_FOUND，說明分頁名稱（US4-6）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    s.t.db.prepare(`UPDATE activities SET sheet_id = 999`).run();
    const res = await s.wb.preview();
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'SHEET_TAB_NOT_FOUND',
      message: '找不到學習單分頁「學習單」，請確認分頁是否被刪除',
    });
  });
});

describe('找不到標註（US5）', () => {
  /** 移除第 3 題作答格（G9）的標註 */
  function removeAnswerAnnotation(x: WritebackServer, questionKey: string) {
    for (const m of x.google.metadataOf(x.spreadsheetId, x.sheetTitle)) {
      if (m.key !== 'qimport.row') continue;
      const items = JSON.parse(m.value) as { q: string; r: string }[];
      m.value = JSON.stringify(items.filter((i) => !(i.q === questionKey && i.r === 'A')));
    }
  }

  it('找不到標註 → ANNOTATION_MISSING，顯示匯入時位置與其目前內容（US5-1）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案一']]]);
    await s.t.answer(3, [['S301', ['答案三']]]);
    removeAnswerAnnotation(s, 'qs03');
    s.google.setCell(s.spreadsheetId, s.sheetTitle, 'G9', '舊內容');
    const v = await preview(s);
    expect(v.items[1]).toMatchObject({
      key: 'qs03:0',
      questionNumber: '3',
      cell: null,
      fallbackCell: 'G9',
      currentContent: '舊內容',
      status: 'ANNOTATION_MISSING',
    });
    expect(v.summary.unresolvedCount).toBe(1);
  });

  it('同一題的標註與其他角色落在同一格 → ANNOTATION_DUPLICATED（US5-3）', async () => {
    s = await startWritebackServer();
    await s.t.answer(3, [['S301', ['答案三']]]);
    // 讓第 3 題作答格的欄錨點與題目格相同（兩個角色落在同一格）
    for (const m of s.google.metadataOf(s.spreadsheetId, s.sheetTitle)) {
      if (m.key !== 'qimport.row') continue;
      const items = JSON.parse(m.value) as { q: string; r: string; c: string }[];
      const q = items.find((i) => i.q === 'qs03' && i.r === 'Q');
      const a = items.find((i) => i.q === 'qs03' && i.r === 'A');
      if (q && a) {
        a.c = q.c;
        m.value = JSON.stringify(items);
      }
    }
    const v = await preview(s);
    expect(v.items[0]).toMatchObject({
      key: 'qs03:0',
      cell: null,
      status: 'ANNOTATION_DUPLICATED',
    });
  });

  it('所有作答格都找不到標註 → 409 WRITEBACK_NOT_THIS_SHEET，附學習單名稱與連結（US5-4）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案一']]]);
    s.google.metadataOf(s.spreadsheetId, s.sheetTitle).length = 0;
    const res = await s.wb.preview();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WRITEBACK_NOT_THIS_SHEET');
    expect(res.body.error.hint).toContain('軟工期末專案_單題_範例');
    expect(res.body.error.details.url).toContain('fakeSingleSheet');
  });
});
