/** AnnotationCodec.decode 的帶回規則（T072、research R3、FR-024）。 */
import { describe, expect, it } from 'vitest';
import {
  autoNumber,
  validateAnnotations,
  type AnnotatedQuestion,
  type GridSnapshot,
} from '@buzzer/shared';
import { AnnotationCodec } from '../../src/domain/annotationCodec.js';
import type { MetadataEntry } from '../../src/domain/questionPorts.js';

const codec = new AnnotationCodec();
const SHEET = 7;
const grid: GridSnapshot = {
  rowCount: 40,
  columnCount: 12,
  cells: [],
  merges: [],
  hiddenRows: [],
  hiddenColumns: [],
};

const q = (
  key: string,
  kind: 'SINGLE' | 'GROUP',
  parts: [string, string][],
  over: Partial<AnnotatedQuestion> = {},
): AnnotatedQuestion => ({
  key,
  label: '',
  labelManual: false,
  kind,
  stemCell: null,
  parts: parts.map(([questionCell, answerCell]) => ({ questionCell, answerCell })),
  ...over,
});

const doc = () =>
  autoNumber({
    questions: [
      q(
        'qa01',
        'GROUP',
        [
          ['C5', 'H5'],
          ['C6', 'H6'],
        ],
        { stemCell: 'B3' },
      ),
      q('qa02', 'SINGLE', [['C8', 'G8']], { label: 'Q二', labelManual: true }),
      q('qa03', 'SINGLE', [['C10', 'G10']]),
    ],
  });

/** 模擬 Google 在第 beforeRow 列（1 起算）上方插入 n 列後 metadata 的位置。 */
const insertRows = (entries: MetadataEntry[], beforeRow: number, n: number) =>
  entries.map((e) =>
    e.location.type === 'ROW' && e.location.index + 1 >= beforeRow
      ? { ...e, location: { ...e.location, index: e.location.index + n } }
      : e,
  );
const insertCols = (entries: MetadataEntry[], beforeCol: number, n: number) =>
  entries.map((e) =>
    e.location.type === 'COLUMN' && e.location.index + 1 >= beforeCol
      ? { ...e, location: { ...e.location, index: e.location.index + n } }
      : e,
  );
const dropAt = (entries: MetadataEntry[], type: 'ROW' | 'COLUMN', oneBased: number) =>
  entries.filter((e) => !(e.location.type === type && e.location.index + 1 === oneBased));

describe('AnnotationCodec.decode：帶回', () => {
  it('插入列後位置順延；題號、手動標記、順序與共同題幹完整還原（正常）', () => {
    const entries = insertRows(codec.encode(doc(), grid, SHEET), 4, 2);
    const { doc: restored, warnings } = codec.decode(entries, grid);
    expect(warnings).toEqual([]);
    expect(restored.questions.map((x) => [x.key, x.label, x.labelManual, x.kind])).toEqual([
      ['qa01', '1', false, 'GROUP'],
      ['qa02', 'Q二', true, 'SINGLE'],
      ['qa03', '3', false, 'SINGLE'],
    ]);
    expect(restored.questions[0]!.stemCell).toBe('B3'); // 在插入點上方，不動
    expect(restored.questions[0]!.parts).toEqual([
      { questionCell: 'C7', answerCell: 'H7' },
      { questionCell: 'C8', answerCell: 'H8' },
    ]);
    expect(restored.questions[2]!.parts[0]).toEqual({ questionCell: 'C12', answerCell: 'G12' });
  });

  it('插入欄後位置右移', () => {
    const entries = insertCols(codec.encode(doc(), grid, SHEET), 4, 1);
    const { doc: restored } = codec.decode(entries, grid);
    expect(restored.questions[0]!.parts[0]).toEqual({ questionCell: 'C5', answerCell: 'I5' });
    expect(restored.questions[1]!.parts[0]).toEqual({ questionCell: 'C8', answerCell: 'H8' });
  });

  it('作答欄被刪除（欄錨點遺失）→ RESTORED_CELL_MISSING，該格為 null（邊界）', () => {
    const entries = dropAt(codec.encode(doc(), grid, SHEET), 'COLUMN', 7); // G 欄
    const { doc: restored, warnings } = codec.decode(entries, grid);
    expect(restored.questions[1]!.parts[0]).toEqual({ questionCell: 'C8', answerCell: null });
    expect(restored.questions[2]!.parts[0]!.answerCell).toBeNull();
    expect(warnings.map((w) => [w.code, w.questionKey])).toEqual([
      ['RESTORED_CELL_MISSING', 'qa02'],
      ['RESTORED_CELL_MISSING', 'qa03'],
    ]);
    expect(warnings[0]!.message).toBe('第 Q二 題的作答格已不存在，請重新指定');
    // 還原後的文件在預覽時被判定為未完成
    const v = validateAnnotations(restored, grid, { complete: true });
    expect(v.issues.map((i) => i.code)).toContain('MISSING_ANSWER_CELL');
  });

  it('題目所在的列被刪除 → 題目格與作答格都遺失（邊界）', () => {
    const entries = dropAt(codec.encode(doc(), grid, SHEET), 'ROW', 6);
    const { doc: restored, warnings } = codec.decode(entries, grid);
    expect(restored.questions[0]!.parts[1]).toEqual({ questionCell: null, answerCell: null });
    expect(warnings.map((w) => w.message)).toEqual([
      '第 1 題（2）的題目格已不存在，請重新指定',
      '第 1 題（2）的作答格已不存在，請重新指定',
    ]);
  });

  it('共同題幹的列被刪除 → 題幹遺失提醒', () => {
    const { doc: restored, warnings } = codec.decode(
      dropAt(codec.encode(doc(), grid, SHEET), 'ROW', 3),
      grid,
    );
    expect(restored.questions[0]!.stemCell).toBeNull();
    expect(warnings[0]!.message).toBe('第 1 題的共同題幹已不存在，請重新指定');
  });

  it('兩個標註落在同一格 → RESTORED_CONFLICT，兩者皆設為 null', () => {
    const entries = codec.encode(doc(), grid, SHEET);
    // 把 qa03 的題目格改成與 qa02 相同的位置（同一列、同一欄錨點）
    const row8 = entries.find((e) => e.location.type === 'ROW' && e.location.index === 7)!;
    const row10 = entries.find((e) => e.location.type === 'ROW' && e.location.index === 9)!;
    const items8 = JSON.parse(row8.value);
    const items10 = JSON.parse(row10.value);
    const moved = entries
      .map((e) => (e === row8 ? { ...e, value: JSON.stringify([...items8, items10[0]]) } : e))
      .filter((e) => e !== row10);
    const { doc: restored, warnings } = codec.decode(moved, grid);
    expect(restored.questions[1]!.parts[0]!.questionCell).toBeNull();
    expect(restored.questions[2]!.parts[0]!.questionCell).toBeNull();
    expect(warnings.map((w) => w.code)).toContain('RESTORED_CONFLICT');
  });

  it('格式錯誤的 metadata 被略過，不會讓讀取失敗', () => {
    const entries: MetadataEntry[] = [
      { key: 'qimport.set', value: '{not json', location: { type: 'SHEET', sheetId: SHEET } },
    ];
    expect(codec.decode(entries, grid)).toEqual({ doc: { questions: [] }, warnings: [] });
  });
});
