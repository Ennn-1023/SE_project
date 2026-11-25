/** 測試替身本身的行為（確保後續整合測試的前提正確）。 */
import { describe, expect, it } from 'vitest';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
import {
  SHEET_TITLE,
  SINGLE_GID,
  SINGLE_ID,
  singleSheet,
} from '../fixtures/google/single-sheet.js';

async function connected() {
  const g = new FakeGoogle().addSpreadsheet(singleSheet());
  const q = g.consent(g.buildAuthUrl('s', 'x'));
  // challenge 不符時交換失敗；以正確 verifier 走一次
  const { createHash } = await import('node:crypto');
  const verifier = 'v'.repeat(43);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q2 = g.consent(g.buildAuthUrl('s', challenge));
  await expect(g.exchangeCode(q.code!, verifier)).rejects.toThrow();
  const tokens = await g.exchangeCode(q2.code!, verifier);
  return { g, token: tokens.accessToken };
}

describe('FakeGoogle', () => {
  it('讀取使用範圍與格子（正常）', async () => {
    const { g, token } = await connected();
    const range = await g.getUsedRange(token, SINGLE_ID, SHEET_TITLE);
    expect(range).toEqual({ rowCount: 15, columnCount: 7 });
    const grid = await g.getGrid(token, SINGLE_ID, SHEET_TITLE, { rowCount: 15, columnCount: 8 });
    expect(grid.cells.find((c) => c.ref === 'C5')?.text).toContain('虛構題目 1');
    expect(grid.merges).toContainEqual({ start: 'C5', end: 'F5' });
  });

  it('插入列時 metadata、格子與合併一起移動；刪除欄時欄 metadata 被刪除', async () => {
    const { g, token } = await connected();
    await g.batchUpdate(token, SINGLE_ID, [
      {
        kind: 'createMetadata',
        entry: {
          key: 'qimport.row',
          value: 'r',
          location: { type: 'ROW', sheetId: SINGLE_GID, index: 4 },
        },
      },
      {
        kind: 'createMetadata',
        entry: {
          key: 'qimport.col',
          value: 'c',
          location: { type: 'COLUMN', sheetId: SINGLE_GID, index: 6 },
        },
      },
    ]);
    g.insertRows(SINGLE_ID, SHEET_TITLE, 3, 2);
    const meta = await g.searchMetadata(token, SINGLE_ID, SINGLE_GID);
    expect(meta.find((m) => m.key === 'qimport.row')!.location).toMatchObject({ index: 6 });
    expect(g.getCell(SINGLE_ID, SHEET_TITLE, 'C7')).toContain('虛構題目 1');
    g.deleteColumns(SINGLE_ID, SHEET_TITLE, 7, 1);
    const after = await g.searchMetadata(token, SINGLE_ID, SINGLE_GID);
    expect(after.some((m) => m.key === 'qimport.col')).toBe(false);
  });

  it('沒有編輯權限時 batchUpdate 回 403；無效 token 回 401（邊界）', async () => {
    const { g, token } = await connected();
    g.setPermission(SINGLE_ID, 'view');
    await expect(g.batchUpdate(token, SINGLE_ID, [])).rejects.toMatchObject({ status: 403 });
    await expect(g.getSpreadsheet('bad-token', SINGLE_ID)).rejects.toMatchObject({ status: 401 });
  });
});
