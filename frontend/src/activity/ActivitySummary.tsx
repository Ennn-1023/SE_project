import type { TeacherActivityView } from '@buzzer/shared';
import { Button } from '../components/Button';
import { ExportCsvButton } from './ExportCsvButton';

interface Props {
  view: TeacherActivityView;
  onViewResult: (questionId: string) => void;
  /** 開啟寫回預覽（005 FR-026） */
  onWriteback?: () => void;
}

/** ActivitySummary（004 US5-3）：活動結束後的摘要——題數、已完成題數、各題搶答成功組別 */
export function ActivitySummary({ view, onViewResult, onWriteback }: Props) {
  return (
    <section className="flex flex-col gap-3" aria-label="活動摘要">
      <p className="rounded-lg bg-cream-100 p-3 font-bold">
        活動已結束：共 {view.progress.total} 題，已完成 {view.progress.closed} 題
      </p>
      <ul className="flex flex-col gap-2">
        {view.questions.map((q) => (
          <li key={q.questionId} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">第 {q.label} 題</span>
            {q.status === 'CLOSED' ? (
              <button
                type="button"
                className="min-h-11 text-primary underline"
                onClick={() => onViewResult(q.questionId)}
              >
                {q.winnerTeamName ? `${q.winnerTeamName}搶答成功` : '無人送出'}（查看結果）
              </button>
            ) : (
              <span className="text-ink/70">未開放</span>
            )}
          </li>
        ))}
      </ul>
      {onWriteback ? (
        <div
          className="flex flex-col gap-2 rounded-lg border-2 border-primary/40 bg-cream-100 p-3"
          aria-label="保存本場結果"
        >
          <p className="font-bold">保存本場結果</p>
          <div className="flex flex-wrap items-start gap-2">
            <Button variant="primary" onClick={onWriteback}>
              寫回 Google 試算表
            </Button>
            <ExportCsvButton />
          </div>
        </div>
      ) : null}
    </section>
  );
}
