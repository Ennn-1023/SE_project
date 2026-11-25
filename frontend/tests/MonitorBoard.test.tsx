import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MonitorView } from '@buzzer/shared';
import { MonitorBoard, PROJECTION_WARNING } from '../src/activity/MonitorBoard';
import { AnsweringView } from '../src/components/AnsweringView';
import { answeringView } from './helpers';
import { detail, row, submitted } from './activityFixtures';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const monitor = (over: Partial<MonitorView> = {}): MonitorView => ({
  questionId: 'ACT-1-1',
  round: 1,
  submittedCount: 2,
  teamCount: 4,
  allSubmitted: false,
  teams: [submitted('T2', 1, 'B 的答案'), submitted('T1', 2, 'A 的答案', 5.5), row('T3'), row('T4', { online: 0 })],
  ...over,
});

const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('MonitorBoard（004 US3、FR-015～FR-017）', () => {
  it('顯示倒數、已送出數、順位、送出時間、送出者、答案與「目前最快」', () => {
    render(
      <MonitorBoard
        question={detail(1)}
        monitor={monitor()}
        endsAt={inFuture(42_000)}
        clockOffset={0}
        pending={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('timer')).toHaveTextContent(/00:4[12]/);
    expect(screen.getByTestId('submitted-count')).toHaveTextContent('已送出 2／4 組');
    const b = screen.getByTestId('team-T2');
    expect(within(b).getByText(/第 1 名\s+第 2 組/)).toBeInTheDocument();
    expect(within(b).getByText('目前最快')).toBeInTheDocument();
    expect(within(b).getByText('開放後 3.2 秒 / 送出者：學生T2')).toBeInTheDocument();
    expect(within(b).getByText('B 的答案')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-T3')).getByText('未送出')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-T4')).getByText('離線')).toBeInTheDocument();
    expect(within(screen.getByTestId('team-T3')).getByText('在線 1／1')).toBeInTheDocument();
  });

  it('常駐投影提醒（FR-015、US3-6）', () => {
    render(
      <MonitorBoard question={detail(1)} monitor={monitor()} endsAt={inFuture(5000)} clockOffset={0} pending={false} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(PROJECTION_WARNING);
  });

  it('全部送出時提示可提前結束，但不自動結束（FR-017）', () => {
    const onClose = vi.fn();
    render(
      <MonitorBoard
        question={detail(1)}
        monitor={monitor({ allSubmitted: true, submittedCount: 4 })}
        endsAt={inFuture(5000)}
        clockOffset={0}
        pending={false}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('所有組別都已送出，可提前結束搶答')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('倒數歸零後顯示「時間到，結算中」', () => {
    render(
      <MonitorBoard question={detail(1)} monitor={monitor()} endsAt={inFuture(-1000)} clockOffset={0} pending={false} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('timer')).toHaveTextContent('時間到，結算中');
  });

  it('「結束搶答」需確認；取消則不結束（US2-4），處理中停用', async () => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = userEvent.setup();
    const { rerender } = render(
      <MonitorBoard question={detail(1)} monitor={monitor()} endsAt={inFuture(5000)} clockOffset={0} pending={false} onClose={onClose} />,
    );
    const button = screen.getByRole('button', { name: '結束搶答' });
    expect(button).toHaveAttribute('data-variant', 'danger');
    await user.click(button);
    expect(onClose).not.toHaveBeenCalled();
    await user.click(button);
    expect(confirm).toHaveBeenLastCalledWith('確定要結束第 1 題的搶答嗎？結束後各組無法再送出。');
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <MonitorBoard question={detail(1)} monitor={monitor()} endsAt={inFuture(5000)} clockOffset={0} pending onClose={onClose} />,
    );
    expect(screen.getByRole('button', { name: '處理中…' })).toBeDisabled();
  });
});

describe('老師看板與學生作答頁的倒數階段一致（007 FR-008、SC-003）', () => {
  const phases = (endsAt: string) => {
    const teacher = render(
      <MonitorBoard
        question={detail(1)}
        monitor={monitor()}
        endsAt={endsAt}
        clockOffset={0}
        pending={false}
        onClose={vi.fn()}
      />,
    );
    const student = render(
      <AnsweringView view={answeringView({ endsAt })} clockOffset={0} offline={false} />,
    );
    const phaseOf = (c: HTMLElement) => c.querySelector('.countdown')?.getAttribute('data-phase');
    return [phaseOf(teacher.container), phaseOf(student.container)];
  };

  it('剩 8 秒時兩端都是 urgent（橘）', () => {
    expect(phases(inFuture(8_000))).toEqual(['urgent', 'urgent']);
  });

  it('剩 30 秒時兩端都是 normal（深藍）', () => {
    expect(phases(inFuture(30_000))).toEqual(['normal', 'normal']);
  });
});

