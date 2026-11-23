/**
 * 題組範例的版面（spec.md「範例學習單」）：4 題，第 1、2 題各 2 小題（題號往下合併兩列，
 * G 欄為「（1）」「（2）」標示、H 欄為作答格），第 3、4 題為單題（作答 G～H 合併）。
 * 題目文字為虛構內容。
 */
import type { FakeSpreadsheetInit } from '../../helpers/fakeGoogle.js';

export const GROUP_ID = 'fakeGroupSheet0000000000000001';
export const GROUP_GID = 1028924918;
export const GROUP_URL = `https://docs.google.com/spreadsheets/d/${GROUP_ID}/edit?gid=${GROUP_GID}#gid=${GROUP_GID}`;
export const GROUP_TITLE = '軟工期末專案_題組_範例';

export function groupSheet(): FakeSpreadsheetInit {
  const cells: Record<string, string> = {
    B2: '虛構課程 學習單',
    B4: '題號',
    C4: '題目',
    G4: '作答',
    B5: '1',
    C5: '虛構題目 1-1：第一個小題？',
    G5: '（1）',
    C6: '虛構題目 1-2：第二個小題？',
    G6: '（2）',
    B8: '2',
    C8: '虛構題目 2-1：第一個小題？',
    G8: '（1）',
    C9: '虛構題目 2-2：第二個小題？',
    G9: '（2）',
    B11: '3',
    C11: '虛構題目 3：單題？',
    B13: '4',
    C13: '虛構題目 4：單題？',
  };
  const merges = [
    { start: 'B2', end: 'G2' },
    { start: 'C4', end: 'F4' },
    { start: 'G4', end: 'H4' },
    { start: 'B5', end: 'B6' },
    { start: 'B8', end: 'B9' },
    ...[5, 6, 8, 9, 11, 13].map((r) => ({ start: `C${r}`, end: `F${r}` })),
    { start: 'G11', end: 'H11' },
    { start: 'G13', end: 'H13' },
  ];
  return {
    id: GROUP_ID,
    title: GROUP_TITLE,
    sheets: [{ sheetId: GROUP_GID, title: '學習單', cells, merges }],
  };
}
