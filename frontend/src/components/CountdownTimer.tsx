import { useServerCountdown } from '../hooks/useServerCountdown';

interface Props {
  endsAt: string | undefined;
  clockOffset: number;
  /** 歸零後、收到伺服器結束通知前的文字（老師看板為「時間到，結算中」） */
  expiredText?: string;
}

const URGENT_SEC = 10;

function format(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 剩餘時間；歸零後顯示「時間到，等待結果」直到伺服器推播結束（spec Edge Cases） */
export function CountdownTimer({ endsAt, clockOffset, expiredText = '時間到，等待結果' }: Props) {
  const { remainingSec, expired } = useServerCountdown(endsAt, clockOffset);
  const urgent = !expired && remainingSec <= URGENT_SEC;

  return (
    <div className={`countdown${urgent ? ' countdown-urgent' : ''}`}>
      <span className="countdown-label">剩餘時間</span>
      <span role="timer" aria-live="off" className="countdown-value">
        {expired ? expiredText : format(remainingSec)}
      </span>
    </div>
  );
}
