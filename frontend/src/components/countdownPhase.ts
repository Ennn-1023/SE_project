import type { Countdown } from '../hooks/useServerCountdown';

/**
 * 倒數色彩階段（007 data-model §3）。學生作答頁與老師看板共用，
 * 變色門檻只在這裡定義一次（FR-008）：剩 10 秒內改用強調色（橘）。
 */
export const URGENT_SEC = 10;

export type CountdownPhase = 'normal' | 'urgent' | 'expired';

/** 依「畫面上顯示的秒數」判斷，確保數字與顏色一致（research R3） */
export function countdownPhase(c: Countdown): CountdownPhase {
  if (c.expired) return 'expired';
  if (c.remainingMs === null) return 'normal';
  return c.remainingSec <= URGENT_SEC ? 'urgent' : 'normal';
}
