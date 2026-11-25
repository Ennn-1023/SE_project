import { describe, expect, it } from 'vitest';
import {
  colToLetters,
  isInSnapshot,
  lettersToCol,
  normalizeToMergeTopLeft,
  parseCellRef,
  parseSheetLink,
  toCellRef,
  type GridSnapshot,
} from '../src/annotation';

const ID = '1PXXwWiBKJNpPkLRoJLMzZWsAh4Jzn2bThHTeRAiq3Hg';

describe('A1 工具', () => {
  it('欄號與字母互轉（正常）', () => {
    expect(colToLetters(1)).toBe('A');
    expect(colToLetters(26)).toBe('Z');
    expect(colToLetters(27)).toBe('AA');
    expect(colToLetters(52)).toBe('AZ');
    expect(lettersToCol('A')).toBe(1);
    expect(lettersToCol('AZ')).toBe(52);
    expect(toCellRef(5, 7)).toBe('G5');
  });

  it('parseCellRef 接受合法格式、拒絕不合法格式（邊界）', () => {
    expect(parseCellRef('G5')).toEqual({ row: 5, col: 7 });
    expect(parseCellRef('AZ500')).toEqual({ row: 500, col: 52 });
    for (const bad of ['', 'g5', 'G0', 'G05', 'ABC1', '5G', 'G1000', 'G-1']) {
      expect(parseCellRef(bad)).toBeNull();
    }
  });

  it('合併範圍內任一格正規化為左上角', () => {
    const merges = [{ start: 'C5', end: 'F5' }];
    expect(normalizeToMergeTopLeft('E5', merges)).toBe('C5');
    expect(normalizeToMergeTopLeft('C5', merges)).toBe('C5');
    expect(normalizeToMergeTopLeft('G5', merges)).toBe('G5');
  });

  it('isInSnapshot 判斷是否在使用範圍內', () => {
    const snap: GridSnapshot = {
      rowCount: 15,
      columnCount: 8,
      cells: [],
      merges: [],
      hiddenRows: [],
      hiddenColumns: [],
    };
    expect(isInSnapshot('H15', snap)).toBe(true);
    expect(isInSnapshot('I1', snap)).toBe(false);
    expect(isInSnapshot('A16', snap)).toBe(false);
    expect(isInSnapshot('bad', snap)).toBe(false);
  });
});

describe('parseSheetLink（research R7、FR-008）', () => {
  it('編輯網址含 gid（query 與 hash）', () => {
    const r = parseSheetLink(
      `https://docs.google.com/spreadsheets/d/${ID}/edit?gid=1028924918#gid=1028924918`,
    );
    expect(r).toEqual({ ok: true, link: { spreadsheetId: ID, gid: 1028924918 } });
  });

  it('只有 hash 中的 gid', () => {
    const r = parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`);
    expect(r).toEqual({ ok: true, link: { spreadsheetId: ID, gid: 0 } });
  });

  it('分享網址 ?usp=sharing、沒有 gid', () => {
    const r = parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`);
    expect(r).toEqual({ ok: true, link: { spreadsheetId: ID, gid: null } });
  });

  it('多帳號網址 /u/1/d/{id} 與前後空白', () => {
    const r = parseSheetLink(`  https://docs.google.com/spreadsheets/u/1/d/${ID}  `);
    expect(r).toEqual({ ok: true, link: { spreadsheetId: ID, gid: null } });
  });

  it.each([
    ['空字串', ''],
    ['只有空白', '   '],
    ['超過 2,000 字元', `https://docs.google.com/spreadsheets/d/${ID}/edit#${'x'.repeat(2000)}`],
    ['http', `http://docs.google.com/spreadsheets/d/${ID}/edit`],
    ['非 docs.google.com', `https://evil.example.com/spreadsheets/d/${ID}/edit`],
    ['Google 文件', `https://docs.google.com/document/d/${ID}/edit`],
    ['id 少於 20 字元', 'https://docs.google.com/spreadsheets/d/short-id/edit'],
    ['不是網址', '學習單'],
  ])('拒絕：%s（邊界）', (_label, input) => {
    const r = parseSheetLink(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe('請貼上 Google 試算表連結');
      expect(r.hint).toContain('https://docs.google.com/spreadsheets/d/');
    }
  });

  it('gid 不是數字時拒絕並說明（邊界）', () => {
    const r = parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=abc`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('gid');
  });
});
