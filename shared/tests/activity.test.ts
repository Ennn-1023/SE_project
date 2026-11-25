import { describe, expect, it } from 'vitest';
import {
  ActivityRules,
  describeError,
  joinPartAnswers,
  validatePartAnswers,
  validateSeconds,
} from '../src';

describe('validateSeconds（data-model.md §4 seconds）', () => {
  it('省略時為預設 60 秒', () => {
    expect(validateSeconds(undefined)).toEqual({ ok: true, value: 60 });
  });

  it.each([5, 60, 600])('%s 秒可接受（邊界含 5 與 600）', (s) => {
    expect(validateSeconds(s)).toEqual({ ok: true, value: s });
  });

  it.each([4, 601, 0, -1, 60.5, '60', '', ' ', null, Number.NaN, Infinity])(
    '%s 被拒',
    (s) => {
      expect(validateSeconds(s)).toEqual({ ok: false });
    },
  );

  it('錯誤訊息說明範圍', () => {
    expect(describeError('INVALID_SECONDS').message).toBe('作答秒數須為 5～600 的整數');
  });
});

describe('validatePartAnswers（data-model.md §4 answers、answers[i]）', () => {
  const single = [{ partIndex: 0, partLabel: null }];
  const group = [
    { partIndex: 0, partLabel: '（1）' },
    { partIndex: 1, partLabel: '（2）' },
  ];

  it('單題：去除前後空白後保存', () => {
    expect(validatePartAnswers(['  ACK  '], single)).toEqual({
      ok: true,
      value: [{ partIndex: 0, partLabel: null, answer: 'ACK' }],
    });
  });

  it('題組：每小題各一個答案', () => {
    const r = validatePartAnswers(['甲', '乙'], group);
    expect(r).toEqual({
      ok: true,
      value: [
        { partIndex: 0, partLabel: '（1）', answer: '甲' },
        { partIndex: 1, partLabel: '（2）', answer: '乙' },
      ],
    });
  });

  it('數量與小題數不符 → PART_COUNT_MISMATCH', () => {
    expect(validatePartAnswers(['甲'], group)).toMatchObject({
      ok: false,
      code: 'PART_COUNT_MISMATCH',
      expected: 2,
      actual: 1,
    });
    expect(validatePartAnswers('甲', group)).toMatchObject({ code: 'PART_COUNT_MISMATCH' });
  });

  it('第（2）小題空白或只有空白 → PART_ANSWER_EMPTY，指出小題', () => {
    for (const blank of ['', '  \n ']) {
      const r = validatePartAnswers(['甲', blank], group);
      expect(r).toMatchObject({ ok: false, code: 'PART_ANSWER_EMPTY', index: 1, label: '第（2）小題' });
    }
    expect(describeError('PART_ANSWER_EMPTY', { label: '第（2）小題' }).message).toBe(
      '第（2）小題答案不可為空',
    );
  });

  it('非字串視為空白', () => {
    expect(validatePartAnswers([42, '乙'], group)).toMatchObject({ code: 'PART_ANSWER_EMPTY', index: 0 });
  });

  it('剛好 500 字可接受，501 字 → PART_ANSWER_TOO_LONG（emoji 算 1 字）', () => {
    expect(validatePartAnswers(['😀'.repeat(500), '乙'], group).ok).toBe(true);
    const r = validatePartAnswers(['甲', 'a'.repeat(501)], group);
    expect(r).toMatchObject({ ok: false, code: 'PART_ANSWER_TOO_LONG', index: 1, length: 501 });
    expect(describeError('PART_ANSWER_TOO_LONG', { label: '第（2）小題', length: 501 }).message).toBe(
      '第（2）小題答案最多 500 字，目前 501 字',
    );
  });

  it('ActivityRules 匯出兩個驗證函式', () => {
    expect(ActivityRules.validateSeconds).toBe(validateSeconds);
    expect(ActivityRules.validatePartAnswers).toBe(validatePartAnswers);
  });
});

describe('joinPartAnswers', () => {
  it('單題回傳原答案，題組以小題標籤分行', () => {
    expect(joinPartAnswers([{ partIndex: 0, partLabel: null, answer: 'A' }])).toBe('A');
    expect(
      joinPartAnswers([
        { partIndex: 0, partLabel: '（1）', answer: '甲' },
        { partIndex: 1, partLabel: '（2）', answer: '乙' },
      ]),
    ).toBe('（1）甲\n（2）乙');
  });
});
