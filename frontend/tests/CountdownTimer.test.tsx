import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CountdownTimer } from '../src/components/CountdownTimer';

const NOW = Date.parse('2026-11-25T02:00:00.000Z');
const endsIn = (ms: number) => new Date(NOW + ms).toISOString();

function renderTimer(endsAt: string, expiredText?: string) {
  const { container } = render(
    <CountdownTimer endsAt={endsAt} clockOffset={0} expiredText={expiredText} />,
  );
  return {
    box: () => container.querySelector<HTMLElement>('.countdown')!,
    timer: () => screen.getByRole('timer'),
  };
}

describe('CountdownTimer 變色（007 US2、FR-005～FR-010）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('15 秒的題目：00:11 時為深藍，00:10 時立即變橘並維持到歸零', () => {
    const { box, timer } = renderTimer(endsIn(15_000));
    expect(timer()).toHaveTextContent('00:15');
    expect(box()).toHaveAttribute('data-phase', 'normal');
    expect(box()).not.toHaveClass('countdown-urgent');

    act(() => vi.advanceTimersByTime(4_000));
    expect(timer()).toHaveTextContent('00:11');
    expect(box()).toHaveAttribute('data-phase', 'normal');

    act(() => vi.advanceTimersByTime(1_000));
    expect(timer()).toHaveTextContent('00:10');
    expect(box()).toHaveAttribute('data-phase', 'urgent');
    expect(box()).toHaveClass('countdown-urgent');

    act(() => vi.advanceTimersByTime(9_000));
    expect(timer()).toHaveTextContent('00:01');
    expect(box()).toHaveAttribute('data-phase', 'urgent');
  });

  it('載入時只剩 3 秒：第一次顯示就是橘色（FR-010）', () => {
    const { box, timer } = renderTimer(endsIn(3_000));
    expect(timer()).toHaveTextContent('00:03');
    expect(box()).toHaveAttribute('data-phase', 'urgent');
    expect(box()).toHaveClass('countdown-urgent');
  });

  it('5 秒（最短）的題目：從一開始就是橘色', () => {
    const { box } = renderTimer(endsIn(5_000));
    expect(box()).toHaveAttribute('data-phase', 'urgent');
  });

  it('歸零後顯示「時間到，等待結果」，階段為 expired，不加橘色 class（FR-009、research R4）', () => {
    const { box, timer } = renderTimer(endsIn(2_000));
    act(() => vi.advanceTimersByTime(3_000));
    expect(timer()).toHaveTextContent('時間到，等待結果');
    expect(box()).toHaveAttribute('data-phase', 'expired');
    expect(box()).not.toHaveClass('countdown-urgent');
  });

  it('老師看板傳入的 expiredText 會在歸零後顯示', () => {
    const { timer } = renderTimer(endsIn(1_000), '時間到，結算中');
    act(() => vi.advanceTimersByTime(2_000));
    expect(timer()).toHaveTextContent('時間到，結算中');
  });
});
