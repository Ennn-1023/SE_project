import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { StudentView } from '@buzzer/shared';
import { ResultView } from '../src/components/ResultView';

const base = (over: Partial<StudentView>): StudentView => ({
  phase: 'CLOSED',
  serverNow: new Date().toISOString(),
  myTeam: { teamId: 'T1', name: '第 1 組' },
  question: { questionId: 'Q1', number: 1, text: '題目一' },
  myTeamSubmission: null,
  results: [
    { rank: 1, teamName: '第 2 組', answer: 'B 的答案', isWinner: true },
    { rank: 2, teamName: '第 1 組', answer: 'A 的答案', isWinner: false },
  ],
  myTeamOutcome: 'LOSE',
  ...over,
});

describe('ResultView（FR-017、FR-018、Q-T17、Q-T20）', () => {
  it('依順位列出各組，並標示搶答成功的組', () => {
    render(<ResultView view={base({})} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('第 2 組')).toBeInTheDocument();
    expect(within(items[0]!).getByText('B 的答案')).toBeInTheDocument();
    expect(within(items[0]!).getByText('搶答成功')).toBeInTheDocument();
    expect(within(items[1]!).getByText('第 1 組')).toBeInTheDocument();
    expect(within(items[1]!).queryByText('搶答成功')).not.toBeInTheDocument();
    expect(items[0]).toHaveTextContent('1');
  });

  it('本組成功時顯示「本組搶答成功」', () => {
    render(<ResultView view={base({ myTeam: { teamId: 'T2', name: '第 2 組' }, myTeamOutcome: 'WIN' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('本組搶答成功');
  });

  it('本組有送出但不是第一時顯示「本組未成功」', () => {
    render(<ResultView view={base({ myTeamOutcome: 'LOSE' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('本組未成功');
  });

  it('本組未送出時顯示「本組未送出，搶答未成功」', () => {
    render(<ResultView view={base({ myTeam: { teamId: 'T3', name: '第 3 組' }, myTeamOutcome: 'NOT_SUBMITTED' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('本組未送出，搶答未成功');
  });

  it('沒有任何組送出時顯示「本題無組別送出答案」', () => {
    render(<ResultView view={base({ results: [], myTeamOutcome: 'NOT_SUBMITTED' })} />);
    expect(screen.getByText('本題無組別送出答案')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('答案含 <script> 時以純文字顯示', () => {
    const evil = '<script>alert("x")</script>';
    const { container } = render(
      <ResultView view={base({ results: [{ rank: 1, teamName: '第 2 組', answer: evil, isWinner: true }] })} />,
    );
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('顯示題號與題目', () => {
    render(<ResultView view={base({})} />);
    expect(screen.getByText('第 1 題')).toBeInTheDocument();
    expect(screen.getByText('題目一')).toBeInTheDocument();
  });
});
