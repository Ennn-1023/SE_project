import { describe, expect, it } from 'vitest';
import { countdownPhase, URGENT_SEC, type CountdownPhase } from '../src/components/countdownPhase';
import type { Countdown } from '../src/hooks/useServerCountdown';

describe('countdownPhase（007 FR-005、FR-006、contracts/ui-countdown §1）', () => {
  it('門檻與老師端相同，為最後 10 秒（FR-008）', () => {
    expect(URGENT_SEC).toBe(10);
  });

  it.each<[string, Countdown, CountdownPhase]>([
    ['剩 11 秒：深藍', { remainingMs: 11_000, remainingSec: 11, expired: false }, 'normal'],
    [
      '剩 10.4 秒（顯示 00:11）：仍是深藍',
      { remainingMs: 10_400, remainingSec: 11, expired: false },
      'normal',
    ],
    [
      '剩 10 秒（顯示 00:10）：變橘',
      { remainingMs: 10_000, remainingSec: 10, expired: false },
      'urgent',
    ],
    [
      '剩不到 1 秒（顯示 00:01）：橘',
      { remainingMs: 1, remainingSec: 1, expired: false },
      'urgent',
    ],
    ['歸零：等待文字', { remainingMs: 0, remainingSec: 0, expired: true }, 'expired'],
    ['沒有 endsAt：保底為深藍', { remainingMs: null, remainingSec: 0, expired: false }, 'normal'],
  ])('%s', (_name, c, expected) => {
    expect(countdownPhase(c)).toBe(expected);
  });
});
