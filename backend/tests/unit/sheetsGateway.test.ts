/** SheetsGateway 的 HTTP 轉接（research R2、R3）：以虛構的 Google 回應檢查請求與轉換。 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SheetsGateway } from '../../src/integrations/google/sheetsGateway.js';
import { GoogleHttpError, mapGoogleError } from '../../src/integrations/google/googleHttp.js';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '../fixtures/google', name), 'utf8');

const ok = (body: string | object) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const ID = 'fakeSpreadsheetId0000000000001';
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function gateway(fetchImpl: ReturnType<typeof vi.fn>) {
  return new SheetsGateway({ fetch: fetchImpl as never });
}

const call = (f: ReturnType<typeof vi.fn>, i = 0) =>
  f.mock.calls[i] as unknown as [string, RequestInit];

describe('SheetsGateway：讀取', () => {
  it('getSpreadsheet 以 fields 遮罩取得標題與依 index 排序的分頁（正常）', async () => {
    const f = vi.fn(async () => ok(fixture('spreadsheet.json')));
    const info = await gateway(f).getSpreadsheet('tok', ID);
    expect(info).toEqual({
      title: '虛構學習單',
      sheets: [
        { sheetId: 0, title: '說明 頁' },
        { sheetId: 22, title: '第二單元' },
      ],
    });
    const [url, init] = call(f);
    expect(url.startsWith(`${BASE}/${ID}?`)).toBe(true);
    expect(new URL(url).searchParams.get('fields')).toBe(
      'properties.title,sheets.properties(sheetId,title,index)',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('getUsedRange 依 values 計算實際使用範圍；分頁名稱含空白與中文時正確跳脫', async () => {
    const f = vi.fn(async () => ok(fixture('values.json')));
    await expect(gateway(f).getUsedRange('tok', ID, '說明 頁')).resolves.toEqual({
      rowCount: 4,
      columnCount: 7,
    });
    const [url] = call(f);
    expect(url).toContain(`/values/${encodeURIComponent("'說明 頁'")}`);
  });

  it('getUsedRange：空白分頁回 0×0（邊界）', async () => {
    const f = vi.fn(async () => ok({ range: "'A'!A1:Z1000" }));
    await expect(gateway(f).getUsedRange('tok', ID, 'A')).resolves.toEqual({
      rowCount: 0,
      columnCount: 0,
    });
  });

  it("分頁名稱中的單引號以 '' 跳脫", async () => {
    const f = vi.fn(async () => ok({ values: [['x']] }));
    await gateway(f).getUsedRange('tok', ID, "老師's 學習單");
    expect(call(f)[0]).toContain(encodeURIComponent("'老師''s 學習單'"));
  });

  it('getGrid 轉為 GridSnapshot：文字、公式錯誤、範圍內的合併、隱藏列欄', async () => {
    const f = vi.fn(async () => ok(fixture('grid.json')));
    const grid = await gateway(f).getGrid('tok', ID, '說明 頁', { rowCount: 4, columnCount: 7 });
    expect(grid.rowCount).toBe(4);
    expect(grid.columnCount).toBe(7);
    expect(grid.cells).toEqual([
      { ref: 'B1', text: '標題', error: false },
      { ref: 'B3', text: '題號', error: false },
      { ref: 'C3', text: '題目', error: false },
      { ref: 'G3', text: '作答', error: false },
      { ref: 'B4', text: '1', error: false },
      { ref: 'C4', text: '#REF!', error: true },
    ]);
    expect(grid.merges).toEqual([{ start: 'C3', end: 'F3' }]);
    expect(grid.hiddenRows).toEqual([2]);
    expect(grid.hiddenColumns).toEqual([4]);
    const url = new URL(call(f)[0]);
    expect(url.searchParams.get('ranges')).toBe("'說明 頁'!A1:G4");
    expect(url.searchParams.get('includeGridData')).toBe('true');
    expect(url.searchParams.get('fields')).toContain('formattedValue');
    expect(url.searchParams.get('fields')).toContain('merges');
  });

  it('getGrid 只回傳目前使用者不能編輯的受保護範圍，含例外範圍與到邊界的範圍（005 T063）', async () => {
    const f = vi.fn(async () =>
      ok({
        sheets: [
          {
            protectedRanges: [
              // G5:G6（0 起算、結尾不含）
              {
                range: { startRowIndex: 4, endRowIndex: 6, startColumnIndex: 6, endColumnIndex: 7 },
                requestingUserCanEdit: false,
              },
              // 整張分頁，但 B 欄例外
              {
                range: { sheetId: 0 },
                unprotectedRanges: [{ startColumnIndex: 1, endColumnIndex: 2 }],
              },
              // 只顯示警告：可寫入，不列入
              { range: { startRowIndex: 0, endRowIndex: 1 }, warningOnly: true },
              // 目前使用者可編輯：不列入
              { range: { startRowIndex: 1, endRowIndex: 2 }, requestingUserCanEdit: true },
            ],
            data: [{}],
          },
        ],
      }),
    );
    const grid = await gateway(f).getGrid('tok', ID, 'A', { rowCount: 4, columnCount: 7 });
    expect(grid.protectedAreas).toEqual([
      { startRow: 5, startCol: 7, endRow: 6, endCol: 7, except: [] },
      {
        startRow: 1,
        startCol: 1,
        endRow: null,
        endCol: null,
        except: [{ startRow: 1, startCol: 2, endRow: null, endCol: 2 }],
      },
    ]);
    expect(new URL(call(f)[0]).searchParams.get('fields')).toContain(
      'protectedRanges(range,unprotectedRanges,warningOnly,requestingUserCanEdit)',
    );
  });

  it('searchMetadata 以本系統三個 key 篩選，轉為 MetadataEntry 並略過其他 key', async () => {
    const f = vi.fn(async () => ok(fixture('metadata-search.json')));
    const entries = await gateway(f).searchMetadata('tok', ID, 0);
    expect(entries).toEqual([
      { key: 'qimport.set', value: '{"v":1,"qs":[]}', location: { type: 'SHEET', sheetId: 0 } },
      { key: 'qimport.row', value: '[]', location: { type: 'ROW', sheetId: 0, index: 4 } },
      {
        key: 'qimport.col',
        value: '{"c":"k1"}',
        location: { type: 'COLUMN', sheetId: 0, index: 6 },
      },
    ]);
    const [url, init] = call(f);
    expect(url).toBe(`${BASE}/${ID}/developerMetadata:search`);
    const body = JSON.parse(String(init.body));
    expect(body.dataFilters).toHaveLength(3);
    expect(body.dataFilters[0].developerMetadataLookup).toMatchObject({
      metadataKey: 'qimport.set',
      metadataLocation: { sheetId: 0 },
      locationMatchingStrategy: 'INTERSECTING_LOCATION',
    });
  });

  it('searchMetadata：沒有任何 metadata 時回空陣列', async () => {
    const f = vi.fn(async () => ok({}));
    await expect(gateway(f).searchMetadata('tok', ID, 0)).resolves.toEqual([]);
  });
});

describe('SheetsGateway：寫入', () => {
  it('batchUpdate：先刪除本系統三個 key 的 metadata，再以 PROJECT 可見度建立（research R3）', async () => {
    const f = vi.fn(async () => ok({}));
    await gateway(f).batchUpdate('tok', ID, [
      { kind: 'deleteMetadata', sheetId: 5, keys: ['qimport.set', 'qimport.row', 'qimport.col'] },
      {
        kind: 'createMetadata',
        entry: { key: 'qimport.set', value: '{}', location: { type: 'SHEET', sheetId: 5 } },
      },
      {
        kind: 'createMetadata',
        entry: { key: 'qimport.row', value: '[]', location: { type: 'ROW', sheetId: 5, index: 4 } },
      },
      {
        kind: 'createMetadata',
        entry: {
          key: 'qimport.col',
          value: '{}',
          location: { type: 'COLUMN', sheetId: 5, index: 6 },
        },
      },
    ]);
    const [url, init] = call(f);
    expect(url).toBe(`${BASE}/${ID}:batchUpdate`);
    expect(init.method).toBe('POST');
    const { requests } = JSON.parse(String(init.body));
    expect(requests).toHaveLength(6);
    expect(requests[0].deleteDeveloperMetadata.dataFilter.developerMetadataLookup).toEqual({
      metadataKey: 'qimport.set',
      metadataLocation: { sheetId: 5 },
      locationMatchingStrategy: 'INTERSECTING_LOCATION',
    });
    expect(requests[3].createDeveloperMetadata.developerMetadata).toEqual({
      metadataKey: 'qimport.set',
      metadataValue: '{}',
      visibility: 'PROJECT',
      location: { sheetId: 5 },
    });
    expect(requests[4].createDeveloperMetadata.developerMetadata.location).toEqual({
      dimensionRange: { sheetId: 5, dimension: 'ROWS', startIndex: 4, endIndex: 5 },
    });
    expect(requests[5].createDeveloperMetadata.developerMetadata.location).toEqual({
      dimensionRange: { sheetId: 5, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 },
    });
  });

  it('batchUpdate 回 403 → 對應為 SHEET_NO_EDIT_PERMISSION（邊界）', async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 }),
    );
    const err = await gateway(f)
      .batchUpdate('tok', ID, [])
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(GoogleHttpError);
    expect(mapGoogleError(err, 'write').code).toBe('SHEET_NO_EDIT_PERMISSION');
  });

  it('updateValues：values:batchUpdate、RAW、每格一個 range（FR-007b）', async () => {
    const f = vi.fn(async () => ok({}));
    await gateway(f).updateValues('tok', ID, "老師's 學習單", [
      { cell: 'G5', value: '答案一' },
      { cell: 'H6', value: '=1+1' },
    ]);
    const [url, init] = call(f);
    expect(url).toBe(`${BASE}/${ID}/values:batchUpdate`);
    expect(JSON.parse(String(init.body))).toEqual({
      valueInputOption: 'RAW',
      data: [
        { range: "'老師''s 學習單'!G5", values: [['答案一']] },
        { range: "'老師''s 學習單'!H6", values: [['=1+1']] },
      ],
    });
  });
});
