/**
 * 確認寫回（005 US1、US2、US4、US5；FR-011～FR-016a、FR-024；SC-003～SC-005）。
 * 以 FakeGoogle 模擬學習單；學生、組別、答案皆為虛構。
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { WritebackOutcomeView, WritebackPreviewView } from '@buzzer/shared';
import { startWritebackServer, type WritebackServer } from '../helpers/activity';

let s: WritebackServer;
afterEach(async () => {
  await s?.t.stop();
});

async function preview(x: WritebackServer): Promise<WritebackPreviewView> {
  const res = await x.wb.preview();
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as WritebackPreviewView;
}

const cell = (x: WritebackServer, ref: string) =>
  x.google.getCell(x.spreadsheetId, x.sheetTitle, ref);
const snapshot = (x: WritebackServer) =>
  JSON.parse(x.google.contentSnapshot(x.spreadsheetId, x.sheetTitle)) as {
    cells: [string, { text: string }][];
  };
/** 兩次快照之間內容不同的格子（`row,col`） */
function changedCells(
  before: ReturnType<typeof snapshot>,
  after: ReturnType<typeof snapshot>,
): string[] {
  const a = new Map(before.cells.map(([k, v]) => [k, v.text]));
  const b = new Map(after.cells.map(([k, v]) => [k, v.text]));
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();
}

async function playFour(x: WritebackServer) {
  await x.t.answer(1, [
    ['S201', ['第 2 組答案一']],
    ['S101', ['第 1 組答案一']],
  ]);
  await x.t.answer(2, [['S301', ['第 3 組答案二']]]);
  await x.t.answer(3, [['S401', ['第 4 組答案三']]]);
  await x.t.answer(4, [['S101', ['第 1 組答案四']]]);
  await x.t.answer(5, []);
}

describe('確認寫回（US1）', () => {
  it('寫入 4 格（4 題），只改確認寫入的作答格，標註不變（US1-2、US1-6、SC-003）', async () => {
    s = await startWritebackServer();
    await playFour(s);
    const metaBefore = JSON.stringify(s.google.metadataOf(s.spreadsheetId, s.sheetTitle));
    const before = snapshot(s);
    const v = await preview(s);
    const res = await s.wb.confirm({ previewId: v.previewId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body as WritebackOutcomeView).toMatchObject({
      writtenCells: 4,
      writtenQuestions: 4,
      overwrittenCells: 0,
      skippedCells: 0,
      skippedReasons: [],
    });
    expect((res.body as WritebackOutcomeView).spreadsheetUrl).toContain('fakeSingleSheet');
    expect([cell(s, 'G5'), cell(s, 'G7'), cell(s, 'G9'), cell(s, 'G11')]).toEqual([
      '第 2 組答案一',
      '第 3 組答案二',
      '第 4 組答案三',
      '第 1 組答案四',
    ]);
    expect(cell(s, 'G13')).toBe('');
    // 只改了 G5、G7、G9、G11（第 7 欄）
    expect(changedCells(before, snapshot(s))).toEqual(['11,7', '5,7', '7,7', '9,7']);
    expect(JSON.stringify(s.google.metadataOf(s.spreadsheetId, s.sheetTitle))).toBe(metaBefore);
    expect(s.google.valueUpdates).toHaveLength(1);
    // 非成功組別（第 1 組在第 1 題）的答案不寫入
    expect(JSON.stringify(s.google.valueUpdates)).not.toContain('第 1 組答案一');
    // 紀錄只有計數，不含答案（FR-025）
    const events = s.t.server.container.repos.exportEvents.listByActivity(s.t.activityId!);
    expect(events).toMatchObject([
      { type: 'WRITEBACK_SUCCEEDED', written: 4, overwritten: 0, skipped: 0 },
    ]);
    expect(JSON.stringify(events)).not.toContain('答案');
  });

  it('插入列後寫入新位置，原位置不被修改（US1-4、SC-002）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案一']]]);
    s.google.insertRows(s.spreadsheetId, s.sheetTitle, 5, 2);
    s.google.setCell(s.spreadsheetId, s.sheetTitle, 'G5', '插入的說明');
    const v = await preview(s);
    expect((await s.wb.confirm({ previewId: v.previewId })).status).toBe(200);
    expect(cell(s, 'G7')).toBe('答案一');
    expect(cell(s, 'G5')).toBe('插入的說明');
  });

  it('以 = + - @ 開頭與含換行的長答案以純文字原樣寫入（FR-014）', async () => {
    s = await startWritebackServer();
    const long = `第一行\n${'長'.repeat(480)}`;
    await s.t.answer(1, [['S201', ['=SUM(A1:A3)']]]);
    await s.t.answer(2, [['S301', ['-5 度']]]);
    await s.t.answer(3, [['S401', [long]]]);
    const v = await preview(s);
    expect((await s.wb.confirm({ previewId: v.previewId })).status).toBe(200);
    expect(cell(s, 'G5')).toBe('=SUM(A1:A3)');
    expect(cell(s, 'G7')).toBe('-5 度');
    expect(cell(s, 'G9')).toBe(long);
  });
});

describe('覆蓋確認（US2）', () => {
  async function setup() {
    s = await startWritebackServer();
    await playFour(s);
    s.google.setCell(s.spreadsheetId, s.sheetTitle, 'G5', '老師筆記');
    s.google.setCell(s.spreadsheetId, s.sheetTitle, 'G7', '  第 3 組答案二 ');
    return preview(s);
  }

  it('預覽標示將覆蓋與相同內容，摘要正確（US2-1、US2-4）', async () => {
    const v = await setup();
    expect(v.items.map((i) => [i.questionNumber, i.status, i.currentContent])).toEqual([
      ['1', 'OVERWRITE', '老師筆記'],
      ['2', 'SAME_CONTENT', '  第 3 組答案二 '],
      ['3', 'EMPTY', ''],
      ['4', 'EMPTY', ''],
    ]);
    expect(v.summary).toMatchObject({ emptyCount: 2, overwriteCount: 1, sameCount: 1 });
  });

  it('有將覆蓋的格子卻未選覆蓋選項 → 400 WRITEBACK_OVERWRITE_REQUIRED，不寫入', async () => {
    const v = await setup();
    const res = await s.wb.confirm({ previewId: v.previewId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WRITEBACK_OVERWRITE_REQUIRED');
    expect(s.google.valueUpdates).toHaveLength(0);
  });

  it('全部覆蓋：寫入 3 格（含覆蓋 1 格），相同內容不重複寫入（US2-2、US2-4）', async () => {
    const v = await setup();
    const res = await s.wb.confirm({ previewId: v.previewId, mode: 'OVERWRITE_ALL' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ writtenCells: 3, overwrittenCells: 1, skippedCells: 0 });
    expect(cell(s, 'G5')).toBe('第 2 組答案一');
    expect(cell(s, 'G7')).toBe('  第 3 組答案二 ');
    expect(s.google.valueUpdates[0]!.map((u) => u.cell).sort()).toEqual(['G11', 'G5', 'G9']);
  });

  it('略過已有內容：只寫空白格，被略過的格子不變（US2-3、SC-004）', async () => {
    const v = await setup();
    const res = await s.wb.confirm({ previewId: v.previewId, mode: 'SKIP_NON_EMPTY' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      writtenCells: 2,
      overwrittenCells: 0,
      skippedCells: 1,
      skippedReasons: [{ reason: 'NON_EMPTY', count: 1 }],
    });
    expect(cell(s, 'G5')).toBe('老師筆記');
  });

  it('預覽後有人修改作答格 → 409 WRITEBACK_STALE 指出題號，不寫入任何格子（US2-5、SC-004）', async () => {
    const v = await setup();
    s.google.setCell(s.spreadsheetId, s.sheetTitle, 'G9', '別人剛寫的');
    const res = await s.wb.confirm({ previewId: v.previewId, mode: 'OVERWRITE_ALL' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'WRITEBACK_STALE',
      message: '學習單在預覽後有變動（第 3 題作答格），請重新預覽',
      details: { questions: ['3'] },
    });
    expect(s.google.valueUpdates).toHaveLength(0);
    // 預覽已失效，需重新預覽
    const again = await s.wb.confirm({ previewId: v.previewId, mode: 'OVERWRITE_ALL' });
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe('WRITEBACK_PREVIEW_EXPIRED');
  });

  it('不按確認（取消）時試算表完全不被修改（US2-6）', async () => {
    s = await startWritebackServer();
    await playFour(s);
    const before = s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle);
    await preview(s);
    expect(s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle)).toBe(before);
    expect(s.google.calls).not.toContain('updateValues');
  });
});

describe('輸入驗證（FR-024、憲章原則 I／II）', () => {
  it.each([
    ['缺少 previewId', {}, 'previewId'],
    ['previewId 格式錯誤', { previewId: 'short' }, 'previewId'],
    ['mode 非允許值', { previewId: 'AAAAAAAAAAAA', mode: 'ALL' }, 'mode'],
    ['fallbackKeys 非陣列', { previewId: 'AAAAAAAAAAAA', fallbackKeys: 'qs03:0' }, 'fallbackKeys'],
    ['多帶欄位', { previewId: 'AAAAAAAAAAAA', force: true }, undefined],
  ])('%s → 400 VALIDATION_ERROR 並指出欄位，未呼叫 Google 寫入', async (_name, body, field) => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    const res = await s.wb.confirm(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    if (field) expect(res.body.error.field).toBe(field);
    expect(res.body.error.message).toMatch(/[㐀-鿿]/);
    expect(res.body.error.hint).toBeTruthy();
    expect(s.google.calls).not.toContain('updateValues');
  });

  it('不存在或已被新預覽取代的 previewId → 410 WRITEBACK_PREVIEW_EXPIRED', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    const first = await preview(s);
    await preview(s);
    const res = await s.wb.confirm({ previewId: first.previewId });
    expect(res.status).toBe(410);
    expect(res.body.error).toMatchObject({
      code: 'WRITEBACK_PREVIEW_EXPIRED',
      message: '預覽已失效',
    });
  });
});

describe('Google 錯誤、冪等與重新開放（US4）', () => {
  it('只有檢視權限 → 403 SHEET_NO_EDIT_PERMISSION，未修改並記錄失敗（US4-5、SC-005）', async () => {
    s = await startWritebackServer();
    await playFour(s);
    const v = await preview(s);
    const before = s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle);
    s.google.setPermission(s.spreadsheetId, 'view');
    const res = await s.wb.confirm({ previewId: v.previewId });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'SHEET_NO_EDIT_PERMISSION',
      message: '你連結的 Google 帳號沒有這份試算表的編輯權限',
    });
    expect(s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle)).toBe(before);
    expect(s.t.server.container.repos.exportEvents.listByActivity(s.t.activityId!)).toMatchObject([
      { type: 'WRITEBACK_FAILED', failureCode: 'SHEET_NO_EDIT_PERMISSION', written: 0 },
    ]);
  });

  it('作答格在受保護範圍 → 403 SHEET_PROTECTED_RANGE，整批不寫入（Edge Case、SC-005）', async () => {
    s = await startWritebackServer();
    await playFour(s);
    const v = await preview(s);
    const before = s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle);
    s.google.protect(s.spreadsheetId, s.sheetTitle, ['G9']);
    const res = await s.wb.confirm({ previewId: v.previewId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SHEET_PROTECTED_RANGE');
    // G9 是第 3 題的作答格（spec Edge Cases：訊息指出題號）
    expect(res.body.error.message).toBe('第 3 題作答格位於受保護範圍，無法寫入');
    expect(res.body.error.details).toEqual({ questions: ['3'] });
    expect(res.body.error.hint).toContain('解除保護');
    expect(s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle)).toBe(before);
  });

  it.each([
    [429, 'RESOURCE_EXHAUSTED', 'GOOGLE_RATE_LIMITED'],
    [503, 'UNAVAILABLE', 'GOOGLE_UNAVAILABLE'],
    [0, 'TIMEOUT', 'GOOGLE_UNAVAILABLE'],
  ])('寫入時 Google %i → %s，不留下部分寫入，可重試（US4-7）', async (status, reason, code) => {
    s = await startWritebackServer();
    await playFour(s);
    const v = await preview(s);
    const before = s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle);
    s.google.failNext(status, reason, 'updateValues');
    const res = await s.wb.confirm({ previewId: v.previewId });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({
      code,
      message: '暫時無法連線到 Google 試算表，請稍後再試',
    });
    expect(s.google.contentSnapshot(s.spreadsheetId, s.sheetTitle)).toBe(before);
    // 同一份預覽可重試
    const retry = await s.wb.confirm({ previewId: v.previewId });
    expect(retry.status).toBe(200);
    expect(retry.body.writtenCells).toBe(4);
  });

  it('連點與兩個裝置同時確認只寫一次（US4-8、FR-015）', async () => {
    s = await startWritebackServer();
    await playFour(s);
    const v = await preview(s);
    // 第二個裝置：同一位老師的另一個登入 session
    const otherDevice = await s.t.teacherAgent();
    s.google.delayMs = 30;
    const [a, b] = await Promise.all([
      s.wb.confirm({ previewId: v.previewId }),
      otherDevice.post('/api/teacher/activity/writeback/confirm').send({ previewId: v.previewId }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect([a, b].find((r) => r.status === 409)!.body.error.code).toBe('WRITEBACK_IN_PROGRESS');
    expect(s.google.valueUpdates).toHaveLength(1);
    // 完成後再確認同一份預覽 → 同一份結果，不再寫入
    s.google.delayMs = 0;
    const again = await s.wb.confirm({ previewId: v.previewId });
    expect(again.status).toBe(200);
    expect(again.body).toEqual([a, b].find((r) => r.status === 200)!.body);
    expect(s.google.valueUpdates).toHaveLength(1);
  });

  it('預覽後題目被重新開放並結束 → 409 WRITEBACK_STALE（搶答結果變動）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['舊答案']]]);
    const v = await preview(s);
    await s.t.answer(1, [['S301', ['新答案']]], { reopen: true });
    const res = await s.wb.confirm({ previewId: v.previewId });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('搶答結果在預覽後有變動（第 1 題），請重新預覽');
    expect(s.google.valueUpdates).toHaveLength(0);
  });

  it('寫回後題目重新開放由另一組成功，再寫回時顯示將覆蓋舊答案（US4-9）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['舊答案']]]);
    const v1 = await preview(s);
    expect((await s.wb.confirm({ previewId: v1.previewId })).status).toBe(200);
    await s.t.answer(1, [['S301', ['新答案']]], { reopen: true });
    const v2 = await preview(s);
    expect(v2.items[0]).toMatchObject({
      status: 'OVERWRITE',
      currentContent: '舊答案',
      answer: '新答案',
    });
    const res = await s.wb.confirm({ previewId: v2.previewId, mode: 'OVERWRITE_ALL' });
    expect(res.body).toMatchObject({ writtenCells: 1, overwrittenCells: 1 });
    expect(cell(s, 'G5')).toBe('新答案');
  });
});

describe('找不到標註時寫入匯入時位置（US5-2）', () => {
  function removeAnswerAnnotation(x: WritebackServer, questionKey: string) {
    for (const m of x.google.metadataOf(x.spreadsheetId, x.sheetTitle)) {
      if (m.key !== 'qimport.row') continue;
      const items = JSON.parse(m.value) as { q: string; r: string }[];
      m.value = JSON.stringify(items.filter((i) => !(i.q === questionKey && i.r === 'A')));
    }
  }

  async function setup() {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案一']]]);
    await s.t.answer(3, [['S301', ['答案三']]]);
    removeAnswerAnnotation(s, 'qs03');
    return preview(s);
  }

  it('未勾選 → 略過並列為「找不到標註」，其他題照常寫入', async () => {
    const v = await setup();
    const res = await s.wb.confirm({ previewId: v.previewId });
    expect(res.body).toMatchObject({
      writtenCells: 1,
      skippedCells: 1,
      skippedReasons: [{ reason: 'ANNOTATION_MISSING', count: 1 }],
    });
    expect(cell(s, 'G5')).toBe('答案一');
    expect(cell(s, 'G9')).toBe('');
  });

  it('勾選「寫入匯入時的位置」→ 寫入後備格', async () => {
    const v = await setup();
    const res = await s.wb.confirm({ previewId: v.previewId, fallbackKeys: ['qs03:0'] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ writtenCells: 2, writtenQuestions: 2, skippedCells: 0 });
    expect(cell(s, 'G9')).toBe('答案三');
  });

  it('勾選不屬於本預覽找不到標註的項目 → 400 VALIDATION_ERROR（fallbackKeys）', async () => {
    const v = await setup();
    const res = await s.wb.confirm({ previewId: v.previewId, fallbackKeys: ['qs01:0'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'fallbackKeys' });
    expect(s.google.valueUpdates).toHaveLength(0);
  });
});
