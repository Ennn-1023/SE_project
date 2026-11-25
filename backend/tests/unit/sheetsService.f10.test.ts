/** F10 用的定位與寫入能力（FR-007；diagrams/003-sequence-reimport.puml 最後一段）。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
import { importSheet, singleAnnotations } from '../helpers/annotations.js';
import { connectGoogle, createTestApp, loginTeacher, type TestApp } from '../helpers/testApp.js';
import {
  SHEET_TITLE,
  SINGLE_GID,
  SINGLE_ID,
  SINGLE_URL,
  singleSheet,
} from '../fixtures/google/single-sheet.js';

let google: FakeGoogle;
let t: TestApp;
let teacherId: number;

beforeEach(async () => {
  google = new FakeGoogle().addSpreadsheet(singleSheet());
  t = await createTestApp({ google });
  const agent = await loginTeacher(t);
  await connectGoogle(google, agent);
  await importSheet(agent, SINGLE_URL, singleAnnotations());
  teacherId = (t.db.prepare("SELECT id FROM users WHERE role = 'TEACHER'").get() as { id: number })
    .id;
});

describe('SheetsService.locateAnswerCells', () => {
  it('回傳每個作答項目目前所在的格子（正常）', async () => {
    const slots = await t.container.services.sheets.locateAnswerCells(
      teacherId,
      SINGLE_ID,
      SINGLE_GID,
    );
    expect(slots).toEqual(
      [5, 7, 9, 11, 13, 15].map((r, i) => ({
        questionKey: `qs${String(i + 1).padStart(2, '0')}`,
        partIndex: 0,
        answerCell: `G${r}`,
      })),
    );
  });

  it('插入列後回傳順延後的位置（不寫死儲存格）', async () => {
    google.insertRows(SINGLE_ID, SHEET_TITLE, 6, 3);
    const slots = await t.container.services.sheets.locateAnswerCells(
      teacherId,
      SINGLE_ID,
      SINGLE_GID,
    );
    expect(slots.map((s) => s.answerCell)).toEqual(['G5', 'G10', 'G12', 'G14', 'G16', 'G18']);
  });
});

describe('SheetsService.writeCells', () => {
  it('只寫入指定的格子，其他格子不變（正常）', async () => {
    const before = google.contentSnapshot(SINGLE_ID, SHEET_TITLE);
    await t.container.services.sheets.writeCells(teacherId, SINGLE_ID, SINGLE_GID, [
      { cell: 'G5', value: '第 1 組的答案' },
      { cell: 'G7', value: '=1+1' },
    ]);
    expect(google.getCell(SINGLE_ID, SHEET_TITLE, 'G5')).toBe('第 1 組的答案');
    // RAW：以文字寫入，不當成公式
    expect(google.getCell(SINGLE_ID, SHEET_TITLE, 'G7')).toBe('=1+1');
    google.setCell(SINGLE_ID, SHEET_TITLE, 'G5', '');
    google.setCell(SINGLE_ID, SHEET_TITLE, 'G7', '');
    expect(google.contentSnapshot(SINGLE_ID, SHEET_TITLE)).toBe(before);
  });

  it('沒有編輯權限 → SHEET_NO_EDIT_PERMISSION（邊界）', async () => {
    google.setPermission(SINGLE_ID, 'view');
    await expect(
      t.container.services.sheets.writeCells(teacherId, SINGLE_ID, SINGLE_GID, [
        { cell: 'G5', value: 'x' },
      ]),
    ).rejects.toMatchObject({ code: 'SHEET_NO_EDIT_PERMISSION' });
  });

  it('格子位置格式錯誤 → VALIDATION_ERROR，不呼叫 Google（邊界）', async () => {
    const before = google.calls.length;
    await expect(
      t.container.services.sheets.writeCells(teacherId, SINGLE_ID, SINGLE_GID, [
        { cell: 'g5', value: 'x' },
      ]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(google.calls.length).toBe(before);
  });

  it('沒有要寫入的格子時直接結束', async () => {
    const before = google.calls.length;
    await t.container.services.sheets.writeCells(teacherId, SINGLE_ID, SINGLE_GID, []);
    expect(google.calls.length).toBe(before);
  });
});
