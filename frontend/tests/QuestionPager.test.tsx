/** QuestionPager（006 US3、FR-015；data-model §3 衍生值） */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionPager } from '../src/questions/QuestionPager';

function renderPager(index: number, total: number) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  render(<QuestionPager index={index} total={total} onPrev={onPrev} onNext={onNext} />);
  return { onPrev, onNext };
}

const prev = () => screen.getByRole('button', { name: '上一題' });
const next = () => screen.getByRole('button', { name: '下一題' });

describe('QuestionPager', () => {
  it('中間的題目：顯示位置、兩個按鈕都可按並觸發回呼（正常）', async () => {
    const { onPrev, onNext } = renderPager(1, 5);
    const position = screen.getByTestId('question-position');
    expect(position).toHaveTextContent('第 2 題／共 5 題');
    expect(position).toHaveAttribute('aria-live', 'polite');
    const user = userEvent.setup();
    await user.click(prev());
    await user.click(next());
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('第一題時「上一題」停用（US3-2，邊界）', () => {
    renderPager(0, 3);
    expect(prev()).toBeDisabled();
    expect(next()).toBeEnabled();
  });

  it('最後一題時「下一題」停用（US3-2，邊界）', () => {
    renderPager(2, 3);
    expect(prev()).toBeEnabled();
    expect(next()).toBeDisabled();
  });

  it('只有一題時兩個按鈕都停用，顯示「第 1 題／共 1 題」（邊界）', () => {
    renderPager(0, 1);
    expect(screen.getByTestId('question-position')).toHaveTextContent('第 1 題／共 1 題');
    expect(prev()).toBeDisabled();
    expect(next()).toBeDisabled();
  });

  it('沒有題目時不顯示（邊界）', () => {
    renderPager(-1, 0);
    expect(screen.queryByTestId('question-pager')).toBeNull();
  });
});
