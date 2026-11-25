import { describe, expect, it } from 'vitest';
import {
  CSV_HEADERS,
  MAX_FALLBACK_KEYS,
  WritebackRules,
  validateFallbackKeys,
  validateOverwriteMode,
} from '../src';

describe('WritebackRules.validateOverwriteMode（data-model.md §5）', () => {
  it('省略時為 undefined（正常）', () => {
    expect(validateOverwriteMode(undefined)).toEqual({ ok: true, value: undefined });
  });

  it.each(['OVERWRITE_ALL', 'SKIP_NON_EMPTY'])('%s 可接受', (mode) => {
    expect(validateOverwriteMode(mode)).toEqual({ ok: true, value: mode });
  });

  it.each(['overwrite_all', '', 'ALL', null, 1, true, {}])('%s 被拒並說明允許值（邊界）', (v) => {
    const r = validateOverwriteMode(v);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('OVERWRITE_ALL');
      expect(r.hint).toBeTruthy();
    }
  });

  it('WritebackRules 物件提供同一組規則', () => {
    expect(WritebackRules.validateOverwriteMode).toBe(validateOverwriteMode);
    expect(WritebackRules.validateFallbackKeys).toBe(validateFallbackKeys);
  });
});

describe('WritebackRules.validateFallbackKeys（data-model.md §5）', () => {
  const allowed = new Set(['qs03:0', 'qg01:1']);

  it('省略時為空陣列；勾選本預覽的找不到標註項目可接受（正常）', () => {
    expect(validateFallbackKeys(undefined, allowed)).toEqual({ ok: true, value: [] });
    expect(validateFallbackKeys(['qs03:0', 'qg01:1'], allowed)).toEqual({
      ok: true,
      value: ['qs03:0', 'qg01:1'],
    });
  });

  it.each([
    ['非陣列', 'qs03:0', '必須是陣列'],
    ['格式錯誤', ['qs03'], '格式不正確'],
    ['小題序兩位數', ['qs03:10'], '格式不正確'],
    ['key 太短', ['q:0'], '格式不正確'],
    ['非字串', [3], '格式不正確'],
    ['重複', ['qs03:0', 'qs03:0'], '重複'],
    ['不屬於允許清單', ['qs04:0'], '不是本預覽'],
  ])('%s 被拒（邊界）', (_name, input, msg) => {
    const r = validateFallbackKeys(input, allowed);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(msg);
  });

  it(`超過 ${MAX_FALLBACK_KEYS} 個被拒`, () => {
    const keys = Array.from(
      { length: MAX_FALLBACK_KEYS + 1 },
      (_, i) => `k${String(i).padStart(5, '0')}:0`,
    );
    const r = validateFallbackKeys(keys, new Set(keys));
    expect(r.ok).toBe(false);
  });
});

describe('CSV_HEADERS', () => {
  it('依 data-model.md §4 的固定順序', () => {
    expect(CSV_HEADERS.join(',')).toBe(
      '題號,小題,題目狀態,組別,搶答順位,是否搶答成功,送出時間（秒）,答案',
    );
  });
});
