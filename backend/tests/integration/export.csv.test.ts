/**
 * 匯出活動結果 CSV（005 US3、US4；FR-017～FR-023、FR-025；SC-007）。
 * 學生、組別、答案皆為虛構；CSV 不得含學生姓名、學號或帳號。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CSV_HEADERS } from '@buzzer/shared';
import { TEST_STUDENTS } from '../helpers/testServer';
import { startWritebackServer, type WritebackServer } from '../helpers/activity';

let s: WritebackServer;
afterEach(async () => {
  await s?.t.stop();
});

/** 最小的 RFC 4180 解析（測試用）：回傳列 × 欄 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += ch;
  }
  return rows;
}

async function exportCsv(x: WritebackServer) {
  const res = await x.wb.csv();
  expect(res.status, String(res.body)).toBe(200);
  return { res, text: res.body as string, rows: parseCsv((res.body as string).slice(1)) };
}

/** 題組範例：第 1 題題組（2 小題，第 2 組最快、第 1 組次之）、第 2 題題組無人送出、第 3 題作答中、第 4 題未開放 */
async function play(x: WritebackServer) {
  await x.t.answer(1, [
    ['S201', ['光合作用,需要光', '他說"對"\n第二行']],
    ['S101', ['=1+1', '-5 度']],
  ]);
  await x.t.answer(2, []);
  await x.t.answer(3, [['S301', ['作答中的答案']]], { close: false });
}

describe('匯出 CSV（US3）', () => {
  it('檔名、標頭、BOM、CRLF 與每題每組每小題一列（US3-1～US3-5、SC-007）', async () => {
    s = await startWritebackServer('group');
    await play(s);
    const { res, text, rows } = await exportCsv(s);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    const disposition = res.headers['content-disposition'] as string;
    expect(disposition).toContain('attachment; filename="activity-results.csv"');
    const encoded = /filename\*=UTF-8''(.+)$/.exec(disposition)![1]!;
    expect(decodeURIComponent(encoded)).toMatch(/^搶答結果_\d{8}-\d{4}\.csv$/);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(rows[0]).toEqual([...CSV_HEADERS]);

    const data = rows.slice(1);
    // 列數 = 已結束題目（2 題 × 4 組 × 2 小題）+ 作答中 1 + 未開放 1
    expect(data).toHaveLength(2 * 4 * 2 + 1 + 1);
    const q1 = data.filter((r) => r[0] === '1');
    expect(q1.map((r) => [r[1], r[3], r[4], r[5]])).toEqual([
      ['（1）', '第 2 組', '1', '是'],
      ['（2）', '第 2 組', '1', '是'],
      ['（1）', '第 1 組', '2', '否'],
      ['（2）', '第 1 組', '2', '否'],
      ['（1）', '第 3 組', '未送出', '否'],
      ['（2）', '第 3 組', '未送出', '否'],
      ['（1）', '第 4 組', '未送出', '否'],
      ['（2）', '第 4 組', '未送出', '否'],
    ]);
    // 同一組各小題的順位與送出時間相同；送出時間精確到 0.1 秒；未送出者空白
    expect(q1[0]![6]).toMatch(/^\d+\.\d$/);
    expect(q1[0]![6]).toBe(q1[1]![6]);
    expect(q1[4]!.slice(6)).toEqual(['', '']);
    // 逗號、引號、換行完整保留；= 開頭加 '；- 開頭不變（US3-6、US3-7、US3-7a）
    expect(q1.map((r) => r[7])).toEqual([
      '光合作用,需要光',
      '他說"對"\n第二行',
      "'=1+1",
      '-5 度',
      '',
      '',
      '',
      '',
    ]);
    expect(text).toContain('"他說""對""\n第二行"');

    const q2 = data.filter((r) => r[0] === '2');
    expect(q2).toHaveLength(8);
    expect(q2.every((r) => r[2] === '已結束' && r[4] === '未送出' && r[5] === '否')).toBe(true);
    expect(data.filter((r) => r[0] === '3')).toEqual([['3', '', '作答中', '', '', '', '', '']]);
    expect(data.filter((r) => r[0] === '4')).toEqual([['4', '', '未開放', '', '', '', '', '']]);
  });

  it('不含學生姓名、學號或帳號，作答中的答案也不出現（FR-017、FR-002）', async () => {
    s = await startWritebackServer('group');
    await play(s);
    const { text } = await exportCsv(s);
    for (const st of TEST_STUDENTS) {
      expect(text).not.toContain(st.name);
      expect(text).not.toContain(st.studentId);
    }
    expect(text).not.toContain('作答中的答案');
  });

  it('重新開放的題目只輸出新一輪，作廢輪次不出現（FR-019）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['舊答案']]]);
    await s.t.answer(1, [['S301', ['新答案']]], { reopen: true });
    const { text, rows } = await exportCsv(s);
    expect(text).not.toContain('舊答案');
    expect(
      rows
        .slice(1)
        .filter((r) => r[0] === '1' && r[5] === '是')
        .map((r) => r[3]),
    ).toEqual(['第 3 組']);
  });

  it('記錄 CSV_EXPORTED 事件（只有列數，不含答案；FR-025）', async () => {
    s = await startWritebackServer('group');
    await play(s);
    await exportCsv(s);
    const events = s.t.server.container.repos.exportEvents.listByActivity(s.t.activityId!);
    expect(events).toMatchObject([
      { type: 'CSV_EXPORTED', rows: 18, spreadsheetId: null, failureCode: null },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/光合作用|=1\+1/);
  });
});

describe('時機與錯誤（US4）', () => {
  it('從未開始活動 → 404 NO_ACTIVITY_RESULTS（US4-2）', async () => {
    s = await startWritebackServer('single', { start: false });
    const res = await s.t.http
      .get('/api/teacher/activity/export.csv')
      .set('Cookie', s.t.teacherCookie);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'NO_ACTIVITY_RESULTS',
      message: '尚無搶答活動結果可寫回或匯出',
    });
  });

  it('Google 連結已中斷時仍可匯出（FR-023、US4-4）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, [['S201', ['答案']]]);
    expect((await s.agent.delete('/api/google/connection')).status).toBe(204);
    const { rows } = await exportCsv(s);
    expect(rows[1]!.slice(0, 6)).toEqual(['1', '', '已結束', '第 2 組', '1', '是']);
  });

  it('沒有任何成功組別時仍輸出未送出列，不是空檔（US4-3）', async () => {
    s = await startWritebackServer();
    await s.t.answer(1, []);
    const { rows } = await exportCsv(s);
    expect(rows.slice(1).filter((r) => r[0] === '1')).toHaveLength(4);
    expect(rows.slice(1).filter((r) => r[2] === '未開放')).toHaveLength(5);
  });
});
