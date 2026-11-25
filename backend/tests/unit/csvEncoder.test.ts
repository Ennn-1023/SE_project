/** CsvEncoder（005 FR-020、FR-021、contracts/csv-format.md）。 */
import { describe, expect, it } from 'vitest';
import { CsvEncoder, encode, escapeField, neutralizeFormula } from '../../src/services/csvEncoder';

describe('neutralizeFormula（FR-021、Clarifications Q3）', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['=HYPERLINK("http://x")', `'=HYPERLINK("http://x")`],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['=', "'="],
  ])('%s 以 = 或 @ 開頭 → 前置單引號', (input, expected) => {
    expect(neutralizeFormula(input)).toBe(expected);
  });

  it.each([['-5 度'], ['+3'], ['\t=1'], ['\r=1'], ['光合作用'], [''], [' =1'], ['a=1']])(
    '%j 不加前綴（+、-、Tab、CR 開頭與一般文字，邊界）',
    (input) => {
      expect(neutralizeFormula(input)).toBe(input);
    },
  );
});

describe('escapeField（FR-020）', () => {
  it.each([
    ['光合作用', '光合作用'],
    ['a,b', '"a,b"'],
    ['他說"對"', '"他說""對"""'],
    ['第一行\n第二行', '"第一行\n第二行"'],
    ['第一行\r\n第二行', '"第一行\r\n第二行"'],
    ['\r', '"\r"'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(escapeField(input)).toBe(expected);
  });
});

describe('encode', () => {
  it('BOM 開頭、CRLF 換行（最後一列也有）、先防注入再跳脫（正常）', () => {
    const csv = encode(
      ['題號', '答案'],
      [
        ['1', '光合作用,需要光'],
        ['2', '=1+1'],
        ['3', '-5 度'],
        ['4', '=A1,"x"'],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      ['題號,答案', '1,"光合作用,需要光"', "2,'=1+1", '3,-5 度', `4,"'=A1,""x"""`].join('\r\n') +
        '\r\n',
    );
  });

  it('組名等任何欄位都套用相同規則；500 字含換行的答案完整保留（Edge Case）', () => {
    const long = `第一行\n${'長'.repeat(495)}`;
    const csv = encode(['組別', '答案'], [['=第 1 組,甲', long]]);
    expect(csv).toContain(`"'=第 1 組,甲","${long}"\r\n`);
  });

  it('沒有資料列時只有標題列（邊界）', () => {
    expect(encode(['a', 'b'], [])).toBe('﻿a,b\r\n');
  });

  it('CsvEncoder 物件提供相同函式', () => {
    expect(CsvEncoder).toEqual({ encode, escapeField, neutralizeFormula });
  });
});
