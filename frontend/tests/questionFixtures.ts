/** 題目匯入前端測試共用的虛構資料。 */
import type { GridSnapshot, QuestionSetView } from '@buzzer/shared';
import type { ImportDraftView } from '../src/api/apiClient';

export const LINK =
  'https://docs.google.com/spreadsheets/d/fakeSingleSheet000000000000001/edit#gid=0';

export const sampleGrid: GridSnapshot = {
  rowCount: 7,
  columnCount: 8,
  cells: [
    { ref: 'C5', text: '虛構題目一？', error: false },
    { ref: 'C7', text: '虛構題目二？', error: false },
  ],
  merges: [{ start: 'C5', end: 'F5' }],
  hiddenRows: [],
  hiddenColumns: [],
};

export function draftView(over: Partial<ImportDraftView> = {}): ImportDraftView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    revision: 0,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    source: {
      spreadsheetId: 'fakeSingleSheet000000000000001',
      spreadsheetTitle: '虛構學習單',
      sheetId: 0,
      sheetTitle: '學習單',
      sourceUrl: LINK,
    },
    sheets: [{ sheetId: 0, title: '學習單' }],
    grid: sampleGrid,
    annotations: { questions: [] },
    restoredCount: 0,
    validation: { issues: [], warnings: [], totalIssues: 0 },
    ...over,
  };
}

/** 題組範例版面（虛構文字）：第 1 題 C5/C6、作答 H5/H6；單題 C11/G11（合併 G11:H11）。 */
export const groupGrid: GridSnapshot = {
  rowCount: 13,
  columnCount: 9,
  cells: [
    { ref: 'A2', text: '閱讀下列文章（共同題幹）', error: false },
    { ref: 'C5', text: '小題 1-1？', error: false },
    { ref: 'G5', text: '（1）', error: false },
    { ref: 'C6', text: '小題 1-2？', error: false },
    { ref: 'G6', text: '（2）', error: false },
    { ref: 'C11', text: '單題 3？', error: false },
    { ref: 'C13', text: '單題 4？', error: false },
    { ref: 'G13', text: '舊答案', error: false },
  ],
  merges: [
    { start: 'C5', end: 'F5' },
    { start: 'C6', end: 'F6' },
    { start: 'G11', end: 'H11' },
    { start: 'G13', end: 'H13' },
  ],
  hiddenRows: [],
  hiddenColumns: [],
};

/** 題組範例的預覽／題目集（虛構文字）。 */
export function questionSetView(over: Partial<QuestionSetView> = {}): QuestionSetView {
  return {
    source: {
      spreadsheetId: 'fakeGroupSheet0000000000000001',
      spreadsheetTitle: '虛構題組學習單',
      sheetId: 0,
      sheetTitle: '學習單',
      sourceUrl: LINK,
    },
    questionCount: 2,
    slotCount: 3,
    questions: [
      {
        label: '1',
        kind: 'GROUP',
        stem: { text: '閱讀下列文章', cell: '學習單!A2' },
        parts: [
          {
            partLabel: '（1）',
            text: '小題 1-1？',
            questionCell: '學習單!C5',
            answerCell: '學習單!H5',
            answerHasContent: false,
          },
          {
            partLabel: '（2）',
            text: '小題 1-2？',
            questionCell: '學習單!C6',
            answerCell: '學習單!H6',
            answerHasContent: false,
          },
        ],
      },
      {
        label: '2',
        kind: 'SINGLE',
        stem: null,
        parts: [
          {
            partLabel: null,
            text: '單題 2？',
            questionCell: '學習單!C13',
            answerCell: '學習單!G13',
            answerHasContent: true,
          },
        ],
      },
    ],
    warnings: [],
    ...over,
  };
}
