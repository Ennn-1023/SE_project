import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StudentView } from '@buzzer/shared';
import { AnsweringView } from '../src/components/AnsweringView';

const view = (over: Partial<StudentView> = {}): StudentView => ({
  phase: 'ANSWERING',
  serverNow: new Date().toISOString(),
  myTeam: { teamId: 'T1', name: '第 1 組' },
  question: { questionId: 'Q1', number: 3, text: '請說明 TCP 三向交握' },
  endsAt: new Date(Date.now() + 42_000).toISOString(),
  myTeamSubmission: null,
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('AnsweringView（FR-001、FR-014、FR-014a）', () => {
  it('顯示題號、題目、倒數，以及「送出後不可修改」提示', () => {
    render(<AnsweringView view={view()} clockOffset={0} offline={false} />);
    expect(screen.getByText('第 3 題')).toBeInTheDocument();
    expect(screen.getByText('請說明 TCP 三向交握')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent(/00:4[12]/);
    expect(screen.getByText('送出後不可修改')).toBeInTheDocument();
  });

  it('即時顯示字數；空白時禁止送出', async () => {
    const user = userEvent.setup();
    render(<AnsweringView view={view()} clockOffset={0} offline={false} />);
    const button = screen.getByRole('button', { name: '送出答案' });
    expect(button).toBeDisabled();
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
    await user.type(screen.getByLabelText('你的答案'), '   ');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('你的答案'), 'SYN😀');
    expect(screen.getByText('4 / 500')).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('超過 500 字時提示並禁止送出', async () => {
    const user = userEvent.setup();
    render(<AnsweringView view={view()} clockOffset={0} offline={false} />);
    await user.click(screen.getByLabelText('你的答案'));
    await user.paste('a'.repeat(501));
    expect(screen.getByText('501 / 500')).toBeInTheDocument();
    expect(screen.getByText('答案最多 500 字，目前 501 字，請精簡後再送出')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '送出答案' })).toBeDisabled();
  });

  it('送出期間按鈕停用並顯示處理中；成功後顯示本組已送出', async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AnsweringView view={view()} clockOffset={0} offline={false} />);
    await user.type(screen.getByLabelText('你的答案'), '我的答案');
    await user.click(screen.getByRole('button', { name: '送出答案' }));

    expect(screen.getByRole('button', { name: '送出中…' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/student/submissions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ questionId: 'Q1', answer: '我的答案' }) }),
    );
    resolve(json({ questionId: 'Q1', teamId: 'T1', answer: '我的答案' }, 201));
    expect(await screen.findByText('本組已送出')).toBeInTheDocument();
  });

  it('伺服器回傳驗證錯誤時顯示 message 與 hint，並恢復可送出', async () => {
    const body = { error: { code: 'ANSWER_TOO_LONG', field: 'answer', message: '答案最多 500 字，目前 501 字', hint: '請精簡後再送出' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(body, 400)));
    const user = userEvent.setup();
    render(<AnsweringView view={view()} clockOffset={0} offline={false} />);
    await user.type(screen.getByLabelText('你的答案'), 'x');
    await user.click(screen.getByRole('button', { name: '送出答案' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('答案最多 500 字，目前 501 字');
    expect(alert).toHaveTextContent('請精簡後再送出');
    expect(screen.getByRole('button', { name: '送出答案' })).toBeEnabled();
  });

  it('收到 myTeamSubmission 時顯示「本組已送出」與答案，且沒有作答區', () => {
    render(
      <AnsweringView view={view({ myTeamSubmission: { answer: '組員送出的答案' } })} clockOffset={0} offline={false} />,
    );
    expect(screen.getByText('本組已送出')).toBeInTheDocument();
    expect(screen.getByText('組員送出的答案')).toBeInTheDocument();
    expect(screen.queryByLabelText('你的答案')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '送出答案' })).not.toBeInTheDocument();
  });

  it('答案內容以純文字顯示，不會被當成 HTML（Q-T20）', () => {
    const { container } = render(
      <AnsweringView view={view({ myTeamSubmission: { answer: '<img src=x onerror=alert(1)>' } })} clockOffset={0} offline={false} />,
    );
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('題組：每小題一個作答框，任一小題空白不能送出，整題一次送出 answers（004 FR-030a）', async () => {
    const fetchMock = vi.fn(async () =>
      json(
        {
          questionId: 'Q2',
          teamId: 'T1',
          answer: '（1）甲\n（2）乙',
          answers: [
            { partIndex: 0, partLabel: '（1）', answer: '甲' },
            { partIndex: 1, partLabel: '（2）', answer: '乙' },
          ],
        },
        201,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <AnsweringView
        view={view({
          question: {
            questionId: 'Q2',
            number: 2,
            label: '2',
            text: '閱讀下列敘述後回答。',
            kind: 'GROUP',
            stem: '閱讀下列敘述後回答。',
            parts: [
              { partIndex: 0, partLabel: '（1）', text: '小題一的題目' },
              { partIndex: 1, partLabel: '（2）', text: '小題二的題目' },
            ],
          },
        })}
        clockOffset={0}
        offline={false}
      />,
    );
    expect(screen.getByText('第 2 題（題組）')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '送出答案' });
    await user.type(screen.getByLabelText('（1）的答案'), '甲');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('（2）的答案'), '乙');
    expect(button).toBeEnabled();
    await user.click(button);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      questionId: 'Q2',
      answers: ['甲', '乙'],
    });
    expect(await screen.findByText('本組已送出')).toBeInTheDocument();
    expect(screen.getByText('（2） 乙')).toBeInTheDocument();
  });

  it('題組某小題超過 500 字時指出小題並禁止送出', async () => {
    render(
      <AnsweringView
        view={view({
          question: {
            questionId: 'Q2',
            number: 2,
            text: '題幹',
            kind: 'GROUP',
            stem: '題幹',
            parts: [
              { partIndex: 0, partLabel: '（1）', text: '小題一' },
              { partIndex: 1, partLabel: '（2）', text: '小題二' },
            ],
          },
        })}
        clockOffset={0}
        offline={false}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('（1）的答案'), '甲');
    await user.click(screen.getByLabelText('（2）的答案'));
    await user.paste('a'.repeat(501));
    expect(screen.getByText('（2）答案最多 500 字，目前 501 字，請精簡後再送出')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '送出答案' })).toBeDisabled();
  });
});
