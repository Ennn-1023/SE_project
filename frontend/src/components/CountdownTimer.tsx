import { useServerCountdown } from '../hooks/useServerCountdown';
import { countdownPhase } from './countdownPhase';

export interface CountdownTimerProps {
  endsAt: string | undefined;
  clockOffset: number;
  /** 歸零後、收到伺服器結束通知前的文字（老師看板為「時間到，結算中」） */
  expiredText?: string;
}

function format(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 剩餘時間；歸零後顯示「時間到，等待結果」直到伺服器推播結束（spec Edge Cases）。
 * 學生作答頁與老師看板共用：剩 10 秒內改為橘色（007 FR-005～FR-008）。
 */
export function CountdownTimer({
  endsAt,
  clockOffset,
  expiredText = '時間到，等待結果',
}: CountdownTimerProps) {
  const countdown = useServerCountdown(endsAt, clockOffset);
  const phase = countdownPhase(countdown);

  return (
    <div className={`countdown${phase === 'urgent' ? ' countdown-urgent' : ''}`} data-phase={phase}>
      <span className="countdown-label">剩餘時間</span>
      <span role="timer" aria-live="off" className="countdown-value">
        {countdown.expired ? expiredText : format(countdown.remainingSec)}
      </span>
    </div>
  );
}
