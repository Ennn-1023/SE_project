import type { QuestionOverviewItem } from './AnnotationPanel';

/**
 * QuestionOverview（006 組件圖、FR-022；contracts/ui-routes.md §4 第 2 點）：
 * 一排題號按鈕，可自動換行；有錯誤的題目以「⚠」與文字標示（不只靠顏色），點選即跳題。
 */
export function QuestionOverview({
  items,
  onSelect,
}: {
  items: QuestionOverviewItem[];
  onSelect: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="題目總覽" data-testid="question-overview">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => {
          const number = item.title.replace(/^第 (.+) 題$/, '$1');
          return (
            <li key={item.key}>
              <button
                type="button"
                data-variant={item.current ? 'primary' : 'ghost'}
                aria-label={item.hasIssue ? `${item.title}，有錯誤` : item.title}
                aria-current={item.current ? 'true' : undefined}
                onClick={() => onSelect(item.key)}
                className={`min-h-11 min-w-11 rounded-md px-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  item.current
                    ? 'bg-primary text-white'
                    : 'border border-cream-300 bg-cream-100 text-ink hover:bg-cream-300'
                } ${item.hasIssue ? 'ring-2 ring-danger' : ''}`}
              >
                {item.hasIssue ? <span aria-hidden="true">⚠ </span> : null}
                {number}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
