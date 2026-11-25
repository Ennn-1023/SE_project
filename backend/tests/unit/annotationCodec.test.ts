/** AnnotationCodec：標註 ⇄ developer metadata（research R3、data-model.md §3）。 */
import { describe, expect, it } from 'vitest';
import {
  autoNumber,
  toCellRef,
  type AnnotatedQuestion,
  type AnnotationDocument,
  type GridSnapshot,
} from '@buzzer/shared';
import { AnnotationCodec } from '../../src/domain/annotationCodec.js';
import type { MetadataEntry } from '../../src/domain/questionPorts.js';

const codec = new AnnotationCodec();
const SHEET = 1028924918;

const grid: GridSnapshot = {
  rowCount: 500,
  columnCount: 52,
  cells: [],
  merges: [],
  hiddenRows: [],
  hiddenColumns: [],
};

function q(
  key: string,
  kind: 'SINGLE' | 'GROUP',
  parts: [string, string][],
  stemCell: string | null = null,
  over: Partial<AnnotatedQuestion> = {},
): AnnotatedQuestion {
  return {
    key,
    label: '',
    labelManual: false,
    kind,
    stemCell,
    parts: parts.map(([questionCell, answerCell]) => ({ questionCell, answerCell })),
    ...over,
  };
}

/** 題組範例的完整標註。 */
const groupDoc = (): AnnotationDocument =>
  autoNumber({
    questions: [
      q(
        'qa01',
        'GROUP',
        [
          ['C5', 'H5'],
          ['C6', 'H6'],
        ],
        'A2',
      ),
      q('qa02', 'GROUP', [
        ['C8', 'H8'],
        ['C9', 'H9'],
      ]),
      q('qa03', 'SINGLE', [['C11', 'G11']]),
      q('qa04', 'SINGLE', [['C13', 'G13']], null, { label: 'Q四', labelManual: true }),
    ],
  });

const byKey = (entries: MetadataEntry[], key: MetadataEntry['key']) =>
  entries.filter((e) => e.key === key);

describe('AnnotationCodec.encode（data-model.md §3）', () => {
  it('一個分頁 qimport.set、每列一筆 qimport.row、每欄一筆 qimport.col（正常）', () => {
    const entries = codec.encode(groupDoc(), grid, SHEET);
    const set = byKey(entries, 'qimport.set');
    expect(set).toHaveLength(1);
    expect(set[0]!.location).toEqual({ type: 'SHEET', sheetId: SHEET });
    const setValue = JSON.parse(set[0]!.value);
    expect(setValue.v).toBe(1);
    expect(
      setValue.qs.map((x: { q: string; n: string; m: number; k: string }) => [x.q, x.n, x.m, x.k]),
    ).toEqual([
      ['qa01', '1', 0, 'G'],
      ['qa02', '2', 0, 'G'],
      ['qa03', '3', 0, 'S'],
      ['qa04', 'Q四', 1, 'S'],
    ]);
    const rows = byKey(entries, 'qimport.row');
    // 列 2、5、6、8、9、11、13
    expect(rows.map((r) => (r.location as { index: number }).index).sort((a, b) => a - b)).toEqual([
      1, 4, 5, 7, 8, 10, 12,
    ]);
    const cols = byKey(entries, 'qimport.col');
    // 欄 A、C、G、H
    expect(cols.map((c) => (c.location as { index: number }).index).sort((a, b) => a - b)).toEqual([
      0, 2, 6, 7,
    ]);
    // 欄錨點 4–8 字元英數、同一分頁內唯一
    const anchors = cols.map((c) => JSON.parse(c.value).c as string);
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const a of anchors) expect(a).toMatch(/^[A-Za-z0-9]{4,8}$/);
    // 共同題幹 p = -1、角色 S
    const row2 = rows.find((r) => (r.location as { index: number }).index === 1)!;
    expect(JSON.parse(row2.value)).toEqual([{ c: expect.any(String), q: 'qa01', p: -1, r: 'S' }]);
    for (const e of entries) expect(e.location.sheetId).toBe(SHEET);
  });

  it('encode → decode 往返得到相同的標註文件', () => {
    const doc = groupDoc();
    const { doc: decoded, warnings } = codec.decode(codec.encode(doc, grid, SHEET), grid);
    expect(decoded).toEqual(doc);
    expect(warnings).toEqual([]);
  });

  it('200 題 × 10 小題時，每個位置的 value 都小於 30,000 字元（邊界）', () => {
    const questions = Array.from({ length: 200 }, (_, i) =>
      q(
        `k${String(i).padStart(4, '0')}`,
        'GROUP',
        Array.from({ length: 10 }, (_, j): [string, string] => [
          toCellRef(i + 1, 2 * j + 1),
          toCellRef(i + 1, 2 * j + 2),
        ]),
        null,
        { label: `題號${i}`.padEnd(20, '長'), labelManual: true },
      ),
    );
    const entries = codec.encode({ questions }, grid, SHEET);
    for (const e of entries) expect(e.value.length).toBeLessThan(30_000);
    const { doc } = codec.decode(entries, grid);
    expect(doc.questions).toHaveLength(200);
    expect(doc.questions[199]!.parts[9]).toEqual({ questionCell: 'S200', answerCell: 'T200' });
  });

  it('沒有本系統的 metadata 時 decode 回空文件', () => {
    expect(codec.decode([], grid)).toEqual({ doc: { questions: [] }, warnings: [] });
  });
});

describe('AnnotationCodec.fingerprint', () => {
  it('相同 entries 結果相同、順序不同結果仍相同、內容不同結果不同', () => {
    const entries = codec.encode(groupDoc(), grid, SHEET);
    const fp = codec.fingerprint(entries);
    expect(codec.fingerprint([...entries].reverse())).toBe(fp);
    expect(codec.fingerprint(entries.slice(1))).not.toBe(fp);
    expect(codec.fingerprint([])).toMatch(/^[0-9a-f]{64}$/);
  });
});
