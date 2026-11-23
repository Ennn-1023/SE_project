/**
 * SC-004 要求的版面變化（虛構內容）：
 *  1. 只有 1 題  2. 50 題  3. 單題與題組（含共同題幹）混合
 *  4. 作答欄在題目欄左側  5. 作答格為合併格  6. 含 3 個分頁
 */
import type { FakeSpreadsheetInit } from '../../helpers/fakeGoogle.js';

const id = (n: number) => `fakeVariantSheet${String(n).padStart(14, '0')}`;
export const variantUrl = (sheetId: string, gid = 0) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}`;

export function oneQuestion(): FakeSpreadsheetInit {
  return {
    id: id(1),
    title: '一題',
    sheets: [{ sheetId: 0, title: '工作表1', cells: { A1: '唯一的題目？' }, merges: [] }],
  };
}
// 題目 A1、作答格 B1（空白）

export function fiftyQuestions(): FakeSpreadsheetInit {
  const cells: Record<string, string> = { A1: '題號', B1: '題目', C1: '作答' };
  for (let i = 1; i <= 50; i++) {
    cells[`A${i + 1}`] = String(i);
    cells[`B${i + 1}`] = `虛構題目 ${i}？`;
  }
  return { id: id(2), title: '五十題', sheets: [{ sheetId: 0, title: '工作表1', cells }] };
}
// 第 i 題：題目 B(i+1)、作答 C(i+1)

export function mixedWithStem(): FakeSpreadsheetInit {
  return {
    id: id(3),
    title: '混合',
    sheets: [
      {
        sheetId: 0,
        title: '工作表1',
        cells: {
          A1: '閱讀下列文章並回答問題（共同題幹）',
          A2: '小題一？',
          A3: '小題二？',
          A4: '小題三？',
          A6: '單題？',
          C1: '附註',
        },
      },
    ],
  };
}
// 第 1 題：題組，題幹 A1、小題 A2/B2、A3/B3、A4/B4；第 2 題：單題 A6/B6

export function answerLeftOfQuestion(): FakeSpreadsheetInit {
  return {
    id: id(4),
    title: '作答在左',
    sheets: [
      {
        sheetId: 0,
        title: '工作表1',
        cells: {
          B1: '作答',
          C1: '題號',
          D1: '題目',
          C3: '1',
          D3: '左邊作答的題目？',
          C5: '2',
          D5: '第二題？',
        },
        merges: [
          { start: 'D3', end: 'G3' },
          { start: 'D5', end: 'G5' },
        ],
      },
    ],
  };
}
// 第 1 題：題目 D3、作答 B3；第 2 題：題目 D5、作答 B5

export function mergedAnswer(): FakeSpreadsheetInit {
  return {
    id: id(5),
    title: '合併作答格',
    sheets: [
      {
        sheetId: 0,
        title: '工作表1',
        cells: { A1: '題目？' },
        merges: [{ start: 'B1', end: 'D3' }],
      },
    ],
  };
}
// 第 1 題：題目 A1、作答 C2（正規化為 B1）

export function multiTab(): FakeSpreadsheetInit {
  return {
    id: id(6),
    title: '多分頁',
    sheets: [
      { sheetId: 0, title: '說明', cells: { A1: '說明文字' } },
      { sheetId: 11, title: '第一單元', cells: { A1: '第一單元題目？' } },
      { sheetId: 22, title: '第二單元', cells: { A1: '第二單元題目？', A2: '第二題？' } },
    ],
  };
}
