import type { ActivityQuestionDetail, MonitorView } from '@buzzer/shared';
import { Button } from '../components/Button';
import { CountdownTimer } from '../components/CountdownTimer';
import { QuestionContent } from './OpenQuestionForm';
import { TeamRow } from './ResultBoard';

export const PROJECTION_WARNING = '作答中畫面含各組答案，請勿投影給學生';

interface Props {
  question: ActivityQuestionDetail;
  monitor: MonitorView;
  endsAt: string | null;
  clockOffset: number;
  pending: boolean;
  disabled?: boolean;
  onClose: () => void;
}

/**
 * MonitorBoard（004 US3、FR-015～FR-017）：作答中即時顯示剩餘時間、送出組數、各組送出狀態、
 * 順位、送出時間、送出者與答案；常駐投影提醒；「結束搶答」為破壞性操作，需確認。
 */
export function MonitorBoard({
  question,
  monitor,
  endsAt,
  clockOffset,
  pending,
  disabled = false,
  onClose,
}: Props) {
  const confirmClose = () => {
    if (window.confirm(`確定要結束第 ${question.label} 題的搶答嗎？結束後各組無法再送出。`))
      onClose();
  };
  return (
    <section className="flex flex-col gap-4" aria-label="即時監控看板">
      <p
        role="note"
        className="rounded-lg border-2 border-accent bg-cream-100 px-3 py-2 font-bold text-ink"
      >
        {PROJECTION_WARNING}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CountdownTimer
          endsAt={endsAt ?? undefined}
          clockOffset={clockOffset}
          expiredText="時間到，結算中"
        />
        <p className="text-lg font-bold" data-testid="submitted-count">
          已送出 {monitor.submittedCount}／{monitor.teamCount} 組
        </p>
      </div>
      <QuestionContent question={question} />
      {monitor.allSubmitted ? (
        <p role="status" className="rounded-lg bg-cream-300 px-3 py-2 font-medium">
          所有組別都已送出，可提前結束搶答
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {monitor.teams.map((row) => (
          <TeamRow key={row.teamId} row={row} highlight={row.rank === 1 ? '目前最快' : undefined} />
        ))}
      </ul>
      <Button
        variant="danger"
        className="self-start"
        disabled={pending || disabled}
        onClick={confirmClose}
      >
        {pending ? '處理中…' : '結束搶答'}
      </Button>
    </section>
  );
}
