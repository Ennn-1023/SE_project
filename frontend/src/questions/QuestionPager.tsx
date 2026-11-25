import { Button } from '../components/Button';

/**
 * QuestionPager（006 組件圖、contracts/ui-routes.md §4 第 3 點）：上一題／下一題與位置提示。
 * index 為 0 起算；第一題時「上一題」停用，最後一題時「下一題」停用（data-model §3）。
 */
export function QuestionPager({
  index,
  total,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total < 1 || index < 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="question-pager">
      <Button variant="ghost" onClick={onPrev} disabled={index <= 0}>
        上一題
      </Button>
      <p aria-live="polite" className="font-medium" data-testid="question-position">
        第 {index + 1} 題／共 {total} 題
      </p>
      <Button variant="ghost" onClick={onNext} disabled={index >= total - 1}>
        下一題
      </Button>
    </div>
  );
}
