import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenQuestionForm, parseSeconds } from '../src/activity/OpenQuestionForm';
import { listItem } from './activityFixtures';

afterEach(() => vi.restoreAllMocks());

describe('parseSeconds（data-model.md §4 seconds）', () => {
  it.each([
    ['60', 60],
    ['5', 5],
    ['600', 600],
    [' 30 ', 30],
  ])('%j → %s', (raw, value) => expect(parseSeconds(raw)).toBe(value));

  it.each(['4', '601', '0', '-1', '60.5', '六十', '', ' ', '1e2'])('%j 不合法', (raw) => {
    expect(parseSeconds(raw)).toBeNull();
  });
});

describe('OpenQuestionForm（004 US2、FR-007、FR-008）', () => {
  it('預設 60 秒；按「開始搶答」以秒數開放', async () => {
    const onOpen = vi.fn();
    render(<OpenQuestionForm question={listItem(1)} pending={false} onOpen={onOpen} onReopen={vi.fn()} />);
    expect(screen.getByLabelText('作答秒數')).toHaveValue('60');
    await userEvent.setup().click(screen.getByRole('button', { name: '開始搶答' }));
    expect(onOpen).toHaveBeenCalledWith(60);
  });

  it('秒數不合法時即時提示且不開放（US2-10）', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<OpenQuestionForm question={listItem(1)} pending={false} onOpen={onOpen} onReopen={vi.fn()} />);
    const input = screen.getByLabelText('作答秒數');
    await user.clear(input);
    await user.type(input, '4');
    expect(screen.getByText('作答秒數須為 5～600 的整數')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '開始搶答' }));
    expect(onOpen).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '600');
    expect(screen.queryByText('作答秒數須為 5～600 的整數')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '開始搶答' }));
    expect(onOpen).toHaveBeenCalledWith(600);
  });

  it('題組顯示共同題幹與各小題（US2-1）', () => {
    render(<OpenQuestionForm question={listItem(2)} pending={false} onOpen={vi.fn()} onReopen={vi.fn()} />);
    expect(screen.getByText('第 2 題（題組）')).toBeInTheDocument();
    expect(screen.getByText('閱讀下列敘述後回答。')).toBeInTheDocument();
    expect(screen.getByText('小題一的題目')).toBeInTheDocument();
    expect(screen.getByText('小題二的題目')).toBeInTheDocument();
  });

  it('處理中停用按鈕（防連點，FR-014）', () => {
    render(<OpenQuestionForm question={listItem(1)} pending onOpen={vi.fn()} onReopen={vi.fn()} />);
    expect(screen.getByRole('button', { name: '處理中…' })).toBeDisabled();
  });

  it('已結束題目改為「重新開放」，確認視窗說明將取代的結果；取消則不送出（US2-8）', async () => {
    const onReopen = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const closed = listItem(1, { status: 'CLOSED', round: 1, winnerTeamName: '第 2 組' });
    const user = userEvent.setup();
    render(<OpenQuestionForm question={closed} pending={false} onOpen={vi.fn()} onReopen={onReopen} />);
    await user.click(screen.getByRole('button', { name: '重新開放' }));
    expect(confirm).toHaveBeenCalledWith(
      '重新開放會取代第 1 題目前的結果（第 2 組搶答成功），確定重新開放？',
    );
    expect(onReopen).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '重新開放' }));
    expect(onReopen).toHaveBeenCalledWith(60);
  });

  it('CLOSED 時提供「回到等待畫面」', async () => {
    const onBack = vi.fn();
    render(
      <OpenQuestionForm
        question={listItem(2)}
        pending={false}
        onOpen={vi.fn()}
        onReopen={vi.fn()}
        onBackToWaiting={onBack}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: '回到等待畫面' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
