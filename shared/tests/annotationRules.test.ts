/** validateAnnotations、autoNumber、normalizeAnnotations（T046、research R6、data-model.md §2.3）。 */
import { describe, expect, it } from 'vitest';
import {
  autoNumber,
  normalizeAnnotations,
  validateAnnotations,
  type AnnotatedQuestion,
  type AnnotationDocument,
  type GridSnapshot,
} from '../src/annotation';

/** 題組範例的版面（虛構文字）。 */
const groupGrid: GridSnapshot = {
  rowCount: 15,
  columnCount: 10,
  cells: [
    { ref: 'C5', text: '小題 1-1？', error: false },
    { ref: 'G5', text: '（1）', error: false },
    { ref: 'C6', text: '小題 1-2？', error: false },
    { ref: 'G6', text: '（2）', error: false },
    { ref: 'C8', text: '小題 2-1？', error: false },
    { ref: 'C9', text: '小題 2-2？', error: false },
    { ref: 'C11', text: '單題 3？', error: false },
    { ref: 'C13', text: '單題 4？', error: false },
    { ref: 'G13', text: '舊答案', error: false },
    { ref: 'C14', text: '#REF!', error: true },
    { ref: 'C15', text: 'x'.repeat(2001), error: false },
    { ref: 'A2', text: '共同說明', error: false },
  ],
  merges: [
    { start: 'C5', end: 'F5' },
    { start: 'G11', end: 'H11' },
    { start: 'G13', end: 'H13' },
  ],
  hiddenRows: [2],
  hiddenColumns: [],
};

function single(
  key: string,
  q: string | null,
  a: string | null,
  over: Partial<AnnotatedQuestion> = {},
): AnnotatedQuestion {
  return {
    key,
    label: '',
    labelManual: false,
    kind: 'SINGLE',
    stemCell: null,
    parts: [{ questionCell: q, answerCell: a }],
    ...over,
  };
}

function group(
  key: string,
  parts: [string | null, string | null][],
  stemCell: string | null = null,
): AnnotatedQuestion {
  return {
    key,
    label: '',
    labelManual: false,
    kind: 'GROUP',
    stemCell,
    parts: parts.map(([q, a]) => ({ questionCell: q, answerCell: a })),
  };
}

const fullGroupDoc = (): AnnotationDocument =>
  autoNumber({
    questions: [
      group('qa01', [
        ['C5', 'H5'],
        ['C6', 'H6'],
      ]),
      group('qa02', [
        ['C8', 'H8'],
        ['C9', 'H9'],
      ]),
      single('qa03', 'C11', 'G11'),
      single('qa04', 'C13', 'G13'),
    ],
  });

const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);
const keyOf = (i: number) => `k${String(i).padStart(4, '0')}`;

describe('validateAnnotations', () => {
  it('題組範例的完整標註沒有任何 issue（正常）', () => {
    const r = validateAnnotations(fullGroupDoc(), groupGrid, { complete: true });
    expect(r.issues).toEqual([]);
    expect(r.totalIssues).toBe(0);
    // 第 4 題作答格已有內容 → 只提醒
    expect(r.warnings.map((w) => w.code)).toEqual(['ANSWER_HAS_CONTENT']);
    expect(r.warnings[0]).toMatchObject({ cell: 'G13', questionKey: 'qa04' });
  });

  it('同一格擔任兩個角色（跨題）→ CELL_ROLE_CONFLICT，訊息說明原本的角色', () => {
    const doc = autoNumber({ questions: [single('qa01', 'C5', 'G5'), single('qa02', 'C6', 'G5')] });
    const r = validateAnnotations(doc, groupGrid, { complete: false });
    expect(codes(r)).toEqual(['CELL_ROLE_CONFLICT']);
    expect(r.issues[0]!.message).toBe('G5 已是第 1 題的作答格，請先移除原本的標註');
  });

  it('合併範圍內的不同格視為同一格', () => {
    const doc = autoNumber({ questions: [single('qa01', 'C5', 'G4'), single('qa02', 'E5', 'G6')] });
    expect(codes(validateAnnotations(doc, groupGrid, { complete: false }))).toEqual([
      'CELL_ROLE_CONFLICT',
    ]);
  });

  it('題目格＝作答格 → SAME_CELL_QA', () => {
    const doc = autoNumber({ questions: [single('qa01', 'C5', 'D5')] });
    expect(codes(validateAnnotations(doc, groupGrid, { complete: false }))).toEqual([
      'SAME_CELL_QA',
    ]);
  });

  it.each([
    ['QUESTION_TEXT_EMPTY', 'D7'],
    ['QUESTION_TEXT_ERROR_VALUE', 'C14'],
    ['QUESTION_TEXT_TOO_LONG', 'C15'],
    ['CELL_OUT_OF_RANGE', 'K1'],
    ['CELL_OUT_OF_RANGE', 'not-a-ref'],
  ])('題目格問題 → %s（%s，邊界）', (code, cell) => {
    const doc = autoNumber({ questions: [single('qa01', cell, 'J1')] });
    expect(codes(validateAnnotations(doc, groupGrid, { complete: false }))).toEqual([code]);
  });

  it('題目文字剛好 2,000 字元可接受（邊界）', () => {
    const grid: GridSnapshot = {
      ...groupGrid,
      cells: [...groupGrid.cells, { ref: 'D1', text: '字'.repeat(2000), error: false }],
    };
    const doc = autoNumber({ questions: [single('qa01', 'D1', 'E1')] });
    expect(validateAnnotations(doc, grid, { complete: true }).issues).toEqual([]);
  });

  it('共同題幹也須有文字；位於隱藏列時提醒 CELL_HIDDEN', () => {
    const ok = autoNumber({ questions: [group('qa01', [['C5', 'H5']], 'A2')] });
    const r = validateAnnotations(ok, groupGrid, { complete: true });
    expect(r.issues).toEqual([]);
    expect(r.warnings.map((w) => w.code).sort()).toEqual(['CELL_HIDDEN', 'GROUP_SINGLE_PART']);
    const bad = autoNumber({ questions: [group('qa01', [['C5', 'H5']], 'B3')] });
    expect(codes(validateAnnotations(bad, groupGrid, { complete: false }))).toEqual([
      'QUESTION_TEXT_EMPTY',
    ]);
  });

  it('題號空白、超過 20 字元、去頭尾空白後重複（邊界）', () => {
    const doc: AnnotationDocument = {
      questions: [
        single('qa01', 'C5', 'H5', { label: '   ', labelManual: true }),
        single('qa02', 'C6', 'H6', { label: '題'.repeat(21), labelManual: true }),
        single('qa03', 'C8', 'H8', { label: 'Q1', labelManual: true }),
        single('qa04', 'C9', 'H9', { label: ' Q1 ', labelManual: true }),
        single('qa05', 'C11', 'G11', { label: '題'.repeat(20), labelManual: true }),
      ],
    };
    expect(codes(validateAnnotations(doc, groupGrid, { complete: true }))).toEqual([
      'LABEL_INVALID',
      'LABEL_INVALID',
      'LABEL_DUPLICATE',
    ]);
  });

  it('超過 200 題 → TOO_MANY_QUESTIONS；200 題可接受（邊界）', () => {
    const many = (n: number) =>
      autoNumber({ questions: Array.from({ length: n }, (_, i) => single(keyOf(i), null, null)) });
    expect(codes(validateAnnotations(many(201), groupGrid, { complete: false }))).toContain(
      'TOO_MANY_QUESTIONS',
    );
    expect(codes(validateAnnotations(many(200), groupGrid, { complete: false }))).not.toContain(
      'TOO_MANY_QUESTIONS',
    );
  });

  it('題組超過 10 小題 → TOO_MANY_PARTS（邊界）', () => {
    const parts = Array.from({ length: 11 }, (): [null, null] => [null, null]);
    const doc = autoNumber({ questions: [group('qa01', parts)] });
    expect(codes(validateAnnotations(doc, groupGrid, { complete: false }))).toEqual([
      'TOO_MANY_PARTS',
    ]);
  });

  it('單題有兩個小題 → SINGLE_SHAPE_INVALID', () => {
    const q: AnnotatedQuestion = {
      ...single('qa01', 'C5', 'H5'),
      parts: [
        { questionCell: 'C5', answerCell: 'H5' },
        { questionCell: 'C6', answerCell: 'H6' },
      ],
    };
    expect(
      codes(validateAnnotations(autoNumber({ questions: [q] }), groupGrid, { complete: false })),
    ).toEqual(['SINGLE_SHAPE_INVALID']);
  });

  it('完整性檢查只在 complete: true 時回報', () => {
    const doc = autoNumber({
      questions: [single('qa01', 'C5', null), single('qa02', null, 'H6'), group('qa03', [])],
    });
    expect(validateAnnotations(doc, groupGrid, { complete: false }).issues).toEqual([]);
    const r = validateAnnotations(doc, groupGrid, { complete: true });
    expect(codes(r)).toEqual([
      'MISSING_ANSWER_CELL',
      'MISSING_QUESTION_CELL',
      'GROUP_WITHOUT_PARTS',
    ]);
    expect(r.issues[0]!.message).toBe('第 1 題缺少作答格');
    expect(r.issues[0]!.hint).toBe('請點選該題的作答格');
    expect(codes(validateAnnotations({ questions: [] }, groupGrid, { complete: true }))).toEqual([
      'NO_QUESTIONS',
    ]);
  });

  it('題組小題的訊息帶小題標籤', () => {
    const doc = autoNumber({
      questions: [
        group('qa01', [
          ['C5', 'H5'],
          ['C6', null],
        ]),
      ],
    });
    const r = validateAnnotations(doc, groupGrid, { complete: true });
    expect(r.issues[0]!.message).toBe('第 1 題（2）缺少作答格');
    expect(r.issues[0]).toMatchObject({ questionKey: 'qa01', partIndex: 1 });
  });

  it('問題超過 50 項時只回 50 項並附總數（FR-020）', () => {
    const doc = autoNumber({
      questions: Array.from({ length: 60 }, (_, i) => single(keyOf(i), 'C5', null)),
    });
    const r = validateAnnotations(doc, groupGrid, { complete: true });
    expect(r.issues).toHaveLength(50);
    expect(r.totalIssues).toBeGreaterThan(50);
  });
});

describe('autoNumber（FR-017）', () => {
  it('未手動修改的題號依順序編號，手動修改的保持不變', () => {
    const doc = autoNumber({
      questions: [
        single('qa01', null, null),
        single('qa02', null, null, { label: 'Q二', labelManual: true }),
        single('qa03', null, null, { label: '99' }),
      ],
    });
    expect(doc.questions.map((q) => q.label)).toEqual(['1', 'Q二', '3']);
  });

  it('調整順序後重新編號', () => {
    const doc = fullGroupDoc();
    const reordered = autoNumber({ questions: [doc.questions[3]!, ...doc.questions.slice(0, 3)] });
    expect(reordered.questions.map((q) => [q.key, q.label])).toEqual([
      ['qa04', '1'],
      ['qa01', '2'],
      ['qa02', '3'],
      ['qa03', '4'],
    ]);
  });
});

describe('normalizeAnnotations', () => {
  it('合併範圍內的格子正規化為左上角', () => {
    const doc = normalizeAnnotations({ questions: [single('qa01', 'E5', 'H11')] }, groupGrid);
    expect(doc.questions[0]!.parts[0]).toEqual({ questionCell: 'C5', answerCell: 'G11' });
  });
});
