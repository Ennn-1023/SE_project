import { describe, expect, it } from 'vitest';
import type { ActivityPhase } from '@buzzer/shared';
import { AppError } from '../../src/http/errors';
import { ActivityLockGuard } from '../../src/services/activityLockGuard';

const codeOf = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof AppError ? e.code : String(e);
  }
};

describe('ActivityLockGuard（004 research.md R8）', () => {
  it('未綁定時一律放行（001／003 單獨測試）', () => {
    const guard = new ActivityLockGuard();
    expect(codeOf(() => guard.assertQuestionSetMutable())).toBeNull();
    expect(codeOf(() => guard.assertGroupChangeAllowed())).toBeNull();
  });

  const cases: Array<[ActivityPhase | null, string | null, string | null]> = [
    [null, null, null],
    ['WAITING', 'QUESTION_SET_LOCKED', null],
    ['ANSWERING', 'QUESTION_SET_LOCKED', 'GROUP_CHANGE_LOCKED'],
    ['CLOSED', 'QUESTION_SET_LOCKED', null],
    ['ENDED', null, null],
  ];

  it.each(cases)('階段 %s：題目集 %s、組別 %s', (phase, setCode, groupCode) => {
    const guard = new ActivityLockGuard();
    guard.bind(() => phase);
    expect(codeOf(() => guard.assertQuestionSetMutable())).toBe(setCode);
    expect(codeOf(() => guard.assertGroupChangeAllowed())).toBe(groupCode);
  });
});
