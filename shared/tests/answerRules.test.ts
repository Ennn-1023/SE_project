import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_LENGTH, countChars, validateAnswer } from '../src/answerRules';
import { describeError } from '../src/errorCodes';

describe('validateAnswer', () => {
  it('接受一般答案並去除前後空白', () => {
    expect(validateAnswer('  SYN → SYN-ACK → ACK \n')).toEqual({
      ok: true,
      value: 'SYN → SYN-ACK → ACK',
      length: 19,
    });
  });

  it('空字串回 EMPTY_ANSWER', () => {
    expect(validateAnswer('')).toMatchObject({ ok: false, code: 'EMPTY_ANSWER' });
  });

  it('只有空白與換行回 EMPTY_ANSWER', () => {
    expect(validateAnswer('   \n\t ')).toMatchObject({ ok: false, code: 'EMPTY_ANSWER' });
  });

  it('剛好 500 字可以送出', () => {
    const r = validateAnswer('字'.repeat(MAX_ANSWER_LENGTH));
    expect(r).toMatchObject({ ok: true, length: 500 });
  });

  it('501 字回 ANSWER_TOO_LONG 並帶目前字數', () => {
    expect(validateAnswer('a'.repeat(501))).toEqual({
      ok: false,
      code: 'ANSWER_TOO_LONG',
      length: 501,
    });
  });

  it('emoji 以 1 字計算（500 個 emoji 仍可送出）', () => {
    expect(countChars('😀')).toBe(1);
    expect(validateAnswer('😀'.repeat(500))).toMatchObject({ ok: true, length: 500 });
    expect(validateAnswer('😀'.repeat(501))).toMatchObject({ ok: false, code: 'ANSWER_TOO_LONG' });
  });

  it('前後空白不計入字數上限', () => {
    expect(validateAnswer(`  ${'a'.repeat(500)}  `)).toMatchObject({ ok: true, length: 500 });
  });
});

describe('describeError', () => {
  it('ANSWER_TOO_LONG 訊息包含目前字數與修正提示', () => {
    expect(describeError('ANSWER_TOO_LONG', { length: 523 })).toEqual({
      status: 400,
      message: '答案最多 500 字，目前 523 字',
      hint: '請精簡後再送出',
    });
  });

  it('INVALID_TRANSITION 以中文階段名稱說明', () => {
    const d = describeError('INVALID_TRANSITION', { phase: 'ANSWERING', action: '開放題目', allowed: '等待開放' });
    expect(d.status).toBe(409);
    expect(d.message).toBe('目前階段（作答中）不能執行「開放題目」');
    expect(d.hint).toBe('只有在「等待開放」階段可以執行');
  });
});
