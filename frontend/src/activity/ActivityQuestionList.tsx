import type { QuestionListItem } from '@buzzer/shared';

interface Props {
  questions: QuestionListItem[];
  progress: { closed: number; total: number };
  selectedId: string | null;
  /** 可否選取未開放題目作為開放目標（WAITING／CLOSED） */
  selectable: boolean;
  onSelect: (questionId: string) => void;
  onViewResult: (questionId: string) => void;
}

function StatusBadge({ q }: { q: QuestionListItem }) {
  if (q.status === 'ANSWERING') {
    return <span className="rounded-full bg-accent px-2 py-0.5 text-sm font-medium">作答中</span>;
  }
  if (q.status === 'CLOSED') {
    return (
      <span className="rounded-full bg-cream-300 px-2 py-0.5 text-sm">
        已結束・{q.winnerTeamName ? `${q.winnerTeamName}搶答成功` : '無人送出'}
      </span>
    );
  }
  return <span className="rounded-full border border-cream-300 px-2 py-0.5 text-sm">未開放</span>;
}

/** ActivityQuestionList（004 US1、US4、FR-019）：題號、摘要、狀態與整場進度；點選已結束題目查看結果 */
export function ActivityQuestionList({
  questions,
  progress,
  selectedId,
  selectable,
  onSelect,
  onViewResult,
}: Props) {
  return (
    <section className="flex flex-col gap-2" aria-label="題目清單">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">題目清單</h3>
        <span className="text-sm" data-testid="progress">
          已完成 {progress.closed}／{progress.total} 題
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {questions.map((q) => {
          const canSelect = selectable && q.status === 'NOT_OPENED';
          const canView = q.status === 'CLOSED';
          const selected = q.questionId === selectedId;
          return (
            <li key={q.questionId}>
              <button
                type="button"
                disabled={!canSelect && !canView}
                aria-pressed={selected}
                onClick={() => (canView ? onViewResult(q.questionId) : onSelect(q.questionId))}
                className={`flex min-h-11 w-full flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left ${
                  selected ? 'border-2 border-primary bg-cream-100' : 'border-cream-300 bg-cream-50'
                } disabled:cursor-default`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">第 {q.label} 題</span>
                  {q.kind === 'GROUP' ? <span className="text-sm">（題組）</span> : null}
                  <StatusBadge q={q} />
                </span>
                <span className="text-sm break-words text-ink/80">{q.summary}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
