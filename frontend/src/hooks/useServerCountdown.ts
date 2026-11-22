import { useEffect, useState } from 'react';

export interface Countdown {
  /** 剩餘毫秒；沒有 endsAt 時為 null */
  remainingMs: number | null;
  /** 顯示用秒數（無條件進位） */
  remainingSec: number;
  expired: boolean;
}

const TICK_MS = 250;

function compute(endsAt: string | undefined, clockOffset: number): Countdown {
  if (!endsAt) return { remainingMs: null, remainingSec: 0, expired: false };
  const serverNow = Date.now() + clockOffset;
  const remainingMs = Math.max(0, Date.parse(endsAt) - serverNow);
  return { remainingMs, remainingSec: Math.ceil(remainingMs / 1000), expired: remainingMs === 0 };
}

/**
 * 依伺服器的結束時間點倒數（FR-003、research.md R6）。
 * clockOffset = 伺服器時間 − 裝置時間，用來抵銷裝置時鐘誤差。
 */
export function useServerCountdown(endsAt: string | undefined, clockOffset: number): Countdown {
  const [state, setState] = useState(() => compute(endsAt, clockOffset));

  useEffect(() => {
    setState(compute(endsAt, clockOffset));
    if (!endsAt) return;
    const id = setInterval(() => setState(compute(endsAt, clockOffset)), TICK_MS);
    return () => clearInterval(id);
  }, [endsAt, clockOffset]);

  return state;
}
