import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useServerCountdown } from '../src/hooks/useServerCountdown';

describe('useServerCountdown（Q-T18、FR-003）', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('以 endsAt 與伺服器時間計算剩餘時間，並隨時間遞減', () => {
    vi.setSystemTime(Date.parse('2026-11-20T02:00:00.000Z'));
    const { result } = renderHook(() => useServerCountdown('2026-11-20T02:01:00.000Z', 0));
    expect(result.current).toMatchObject({ remainingSec: 60, expired: false });
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.remainingSec).toBe(45);
  });

  it('裝置時鐘快 30 秒時，仍依 clockOffset 顯示正確剩餘時間', () => {
    // 伺服器時間 02:00:00，但裝置時鐘是 02:00:30 → offset = -30000
    vi.setSystemTime(Date.parse('2026-11-20T02:00:30.000Z'));
    const { result } = renderHook(() => useServerCountdown('2026-11-20T02:01:00.000Z', -30_000));
    expect(result.current.remainingSec).toBe(60);
  });

  it('歸零後回報 expired，剩餘時間不會變成負數', () => {
    vi.setSystemTime(Date.parse('2026-11-20T02:00:55.000Z'));
    const { result } = renderHook(() => useServerCountdown('2026-11-20T02:01:00.000Z', 0));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toMatchObject({ remainingSec: 0, remainingMs: 0, expired: true });
  });

  it('剩餘不足 1 秒時無條件進位顯示 1 秒', () => {
    vi.setSystemTime(Date.parse('2026-11-20T02:00:59.400Z'));
    const { result } = renderHook(() => useServerCountdown('2026-11-20T02:01:00.000Z', 0));
    expect(result.current).toMatchObject({ remainingSec: 1, expired: false });
  });

  it('沒有 endsAt 時回傳 null 狀態', () => {
    const { result } = renderHook(() => useServerCountdown(undefined, 0));
    expect(result.current).toMatchObject({ remainingMs: null, expired: false });
  });
});
