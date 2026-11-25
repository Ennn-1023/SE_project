import type { SkippedCellReason, WritebackOutcomeView } from '@buzzer/shared';
import { Button } from '../components/Button';

const REASON_TEXT: Record<SkippedCellReason, string> = {
  NON_EMPTY: '已有內容',
  ANNOTATION_MISSING: '找不到標註',
  ANNOTATION_DUPLICATED: '標註重複',
};

/** 結果文字（contracts/ui-routes.md；FR-016a） */
export function outcomeText(o: WritebackOutcomeView): string {
  let text = `已寫回 ${o.writtenCells} 格（${o.writtenQuestions} 題）`;
  if (o.overwrittenCells > 0) text += `，其中 ${o.overwrittenCells} 格覆蓋既有內容`;
  if (o.skippedCells > 0) {
    const reasons = o.skippedReasons.map((r) => `${REASON_TEXT[r.reason]} ${r.count}`).join('、');
    text += `；略過 ${o.skippedCells} 格（${reasons}）`;
  }
  return text;
}

interface Props {
  outcome: WritebackOutcomeView;
  onClose: () => void;
}

/** WritebackResultPanel（005 組件圖）：寫回完成後的計數與開啟試算表連結 */
export function WritebackResultPanel({ outcome, onClose }: Props) {
  return (
    <section className="flex flex-col gap-3" aria-label="寫回結果">
      <p role="status" className="rounded-lg bg-cream-100 p-3 font-bold break-words">
        {outcomeText(outcome)}
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={outcome.spreadsheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 font-medium text-white"
        >
          開啟試算表
        </a>
        <Button variant="ghost" onClick={onClose}>
          關閉
        </Button>
      </div>
    </section>
  );
}
