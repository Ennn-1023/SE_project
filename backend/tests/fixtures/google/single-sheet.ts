/**
 * 單題範例的版面（spec.md「範例學習單」）：6 題，題目在 C 欄（C～F 合併）、作答格在 G 欄（G～H 合併）。
 * 題目文字為虛構內容。
 */
import type { FakeSpreadsheetInit } from '../../helpers/fakeGoogle.js';

export const SINGLE_ID = 'fakeSingleSheet000000000000001';
export const SINGLE_GID = 1167716485;
export const SINGLE_URL = `https://docs.google.com/spreadsheets/d/${SINGLE_ID}/edit?gid=${SINGLE_GID}#gid=${SINGLE_GID}`;
export const SINGLE_TITLE = '軟工期末專案_單題_範例';
export const SHEET_TITLE = '學習單';

export const SINGLE_ROWS = [5, 7, 9, 11, 13, 15];

export function singleSheet(): FakeSpreadsheetInit {
  const cells: Record<string, string> = {
    B2: '虛構課程 學習單',
    B4: '題號',
    C4: '題目',
    G4: '作答',
  };
  const merges = [
    { start: 'B2', end: 'G2' },
    { start: 'C4', end: 'F4' },
    { start: 'G4', end: 'H4' },
  ];
  SINGLE_ROWS.forEach((row, i) => {
    cells[`B${row}`] = String(i + 1);
    cells[`C${row}`] = `虛構題目 ${i + 1}：請說明第 ${i + 1} 個概念的名稱？`;
    merges.push({ start: `C${row}`, end: `F${row}` }, { start: `G${row}`, end: `H${row}` });
  });
  return {
    id: SINGLE_ID,
    title: SINGLE_TITLE,
    sheets: [{ sheetId: SINGLE_GID, title: SHEET_TITLE, cells, merges }],
  };
}
