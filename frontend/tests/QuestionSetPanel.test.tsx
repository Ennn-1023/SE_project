/** US3：目前題目集（FR-029）。 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { QuestionSetView } from '@buzzer/shared';
import { QuestionSetPanel } from '../src/questions/QuestionSetPanel';
import { questionSetView } from './questionFixtures';

describe('QuestionSetPanel', () => {
  it('沒有題目集時顯示提示', () => {
    render(<QuestionSetPanel questionSet={null} />);
    expect(screen.getByText('尚未匯入任何題目，請貼上學習單連結開始匯入')).toBeInTheDocument();
  });

  it('顯示來源、題數、匯入時間與全部題目（正常）', () => {
    render(
      <QuestionSetPanel
        questionSet={questionSetView({ importedAt: '2026-11-24T02:30:00.000Z' })}
      />,
    );
    expect(screen.getByText(/虛構題組學習單／學習單/)).toBeInTheDocument();
    expect(screen.getByText(/共 2 題、3 個作答格/)).toBeInTheDocument();
    expect(screen.getByText(/匯入時間/)).toBeInTheDocument();
    const q1 = screen.getByRole('listitem', { name: '第 1 題' });
    expect(within(q1).getByText(/小題 1-2？/)).toBeInTheDocument();
    expect(within(q1).getByText(/學習單!H6/)).toBeInTheDocument();
  });

  it('200 題的題目集可完整瀏覽（不截斷，SC-010）', () => {
    const base = questionSetView();
    const big: QuestionSetView = {
      ...base,
      questionCount: 200,
      slotCount: 200,
      questions: Array.from({ length: 200 }, (_, i) => ({
        label: String(i + 1),
        kind: 'SINGLE' as const,
        stem: null,
        parts: [
          {
            partLabel: null,
            text: `題目 ${i + 1}`,
            questionCell: `學習單!A${i + 1}`,
            answerCell: `學習單!B${i + 1}`,
            answerHasContent: false,
          },
        ],
      })),
    };
    render(<QuestionSetPanel questionSet={big} />);
    expect(screen.getAllByRole('listitem', { name: /^第 \d+ 題$/ })).toHaveLength(200);
    expect(screen.getByText('題目 200')).toBeInTheDocument();
  });
});
