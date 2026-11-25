/** QuestionOverview（006 US4、FR-022；data-model §4 QuestionOverviewItem） */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionOverviewItem } from '../src/questions/AnnotationPanel';
import { QuestionOverview } from '../src/questions/QuestionOverview';

const item = (n: number, over: Partial<QuestionOverviewItem> = {}): QuestionOverviewItem => ({
  key: `k${n}`,
  title: `第 ${n} 題`,
  hasIssue: false,
  current: false,
  ...over,
});

describe('QuestionOverview', () => {
  it('每題一個按鈕，文字為題號；有錯以「⚠」與文字標示，目前這一題有 aria-current（正常）', () => {
    render(
      <QuestionOverview
        items={[item(1, { current: true }), item(2, { hasIssue: true }), item(3)]}
        onSelect={vi.fn()}
      />,
    );
    const nav = screen.getByRole('navigation', { name: '題目總覽' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['1', '⚠ 2', '3']);
    expect(buttons[1]).toHaveAccessibleName('第 2 題，有錯誤');
    expect(buttons[0]).toHaveAccessibleName('第 1 題');
    expect(buttons[0]).toHaveAttribute('aria-current', 'true');
    expect(buttons[1]).not.toHaveAttribute('aria-current');
    for (const b of buttons) expect(b.className).toContain('min-h-11');
    expect(nav.querySelector('ul')!.className).toContain('flex-wrap');
  });

  it('點題號呼叫 onSelect(key)（正常）', async () => {
    const onSelect = vi.fn();
    render(<QuestionOverview items={[item(1), item(5)]} onSelect={onSelect} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '第 5 題' }));
    expect(onSelect).toHaveBeenCalledWith('k5');
  });

  it('自訂題號（例如 Q2）照樣顯示（邊界）', () => {
    render(<QuestionOverview items={[{ ...item(1), title: '第 Q2 題' }]} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: '第 Q2 題' })).toHaveTextContent('Q2');
  });

  it('沒有題目時不顯示（邊界）', () => {
    render(<QuestionOverview items={[]} onSelect={vi.fn()} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
