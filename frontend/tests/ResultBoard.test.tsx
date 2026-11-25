import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ResultBoard } from '../src/activity/ResultBoard';
import { detail, resultView, row, submitted } from './activityFixtures';

describe('ResultBoard（004 US4、FR-018、FR-020）', () => {
  it('依順位顯示，rank 1 標示搶答成功，未送出組列在後，顯示結束原因', () => {
    render(<ResultBoard result={resultView()} />);
    expect(screen.getByText('結束原因：手動結束')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-testid'))).toEqual(['team-T2', 'team-T1', 'team-T3']);
    expect(within(items[0]!).getByText('搶答成功')).toBeInTheDocument();
    expect(within(items[1]!).queryByText('搶答成功')).not.toBeInTheDocument();
    expect(within(items[2]!).getByText('未送出')).toBeInTheDocument();
  });

  it('無人送出時顯示「本題無組別送出答案」', () => {
    render(<ResultBoard result={resultView({ rows: [row('T1'), row('T2')], noSubmission: true, closedReason: 'TIME_UP' })} />);
    expect(screen.getByText('本題無組別送出答案')).toBeInTheDocument();
    expect(screen.getByText('結束原因：時間到')).toBeInTheDocument();
  });

  it('題組依小題分列；重開過的題目顯示輪次', () => {
    render(
      <ResultBoard
        result={resultView({
          question: detail(2),
          round: 2,
          rows: [
            {
              ...submitted('T1', 1, ''),
              answers: [
                { partIndex: 0, partLabel: '（1）', answer: '甲' },
                { partIndex: 1, partLabel: '（2）', answer: '乙' },
              ],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('第 2 題結果')).toBeInTheDocument();
    expect(screen.getByText('結束原因：手動結束（第 2 輪）')).toBeInTheDocument();
    expect(screen.getByText('甲')).toBeInTheDocument();
    expect(screen.getByText('（2）')).toBeInTheDocument();
  });

  it('HTML 與換行以純文字顯示，不被執行（FR-020）', () => {
    const html = '<img src=x onerror="window.hacked=1">\n第二行';
    const { container } = render(<ResultBoard result={resultView({ rows: [submitted('T1', 1, html)] })} />);
    expect(container.querySelector('img')).toBeNull();
    const text = screen.getByTestId('answer-text');
    expect(text.textContent).toContain('<img src=x onerror="window.hacked=1">');
    expect(text.querySelector('p')).toHaveClass('whitespace-pre-wrap');
  });

  it('長答案可展開與收合', async () => {
    const long = Array.from({ length: 10 }, (_, i) => `第 ${i + 1} 行`).join('\n');
    render(<ResultBoard result={resultView({ rows: [submitted('T1', 1, long)] })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '展開完整答案' }));
    expect(screen.getByRole('button', { name: '收合答案' })).toBeInTheDocument();
  });
});
