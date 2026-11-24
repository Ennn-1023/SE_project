import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevTeacherPanel } from '../src/pages/DevTeacherPanel';
import { json, routeFetch } from './helpers';

const questions = [
  { questionId: 'Q1', number: 1, text: '題目一', activityId: 'A1' },
  { questionId: 'Q2', number: 2, text: '題目二', activityId: 'A1' },
];
const status = (over: object = {}) => ({ phase: 'WAITING', currentQuestionId: null, endsAt: null, questions, ...over });

afterEach(() => vi.unstubAllGlobals());

describe('DevTeacherPanel（US6）', () => {
  it('顯示目前階段，並以選擇的題目與秒數呼叫 open', async () => {
    const fetchMock = routeFetch({
      'GET /api/dev/teacher/status': () => json(status()),
      'POST /api/dev/teacher/open': () => json({ phase: 'ANSWERING', currentQuestionId: 'Q2', endsAt: '2026-11-20T02:00:30.000Z' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<DevTeacherPanel />);

    expect(await screen.findByText('等待開放')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('題目'), 'Q2');
    const seconds = screen.getByLabelText('作答秒數');
    expect(seconds).toHaveValue(60);
    await user.clear(seconds);
    await user.type(seconds, '30');
    await user.click(screen.getByRole('button', { name: '開放題目' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/dev/teacher/open',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ questionId: 'Q2', seconds: 30 }) }),
      ),
    );
    expect(await screen.findByText('作答中')).toBeInTheDocument();
    expect(screen.getByText(/目前題目：Q2/)).toBeInTheDocument();
  });

  it.each([
    ['時間到', '/api/dev/teacher/time-up'],
    ['手動結束', '/api/dev/teacher/close'],
    ['下一題', '/api/dev/teacher/next'],
    ['結束活動', '/api/dev/teacher/end'],
    ['重設', '/api/dev/teacher/reset'],
  ])('「%s」按鈕呼叫 %s', async (label, path) => {
    const fetchMock = routeFetch({
      'GET /api/dev/teacher/status': () => json(status()),
      [`POST ${path}`]: () => json({ phase: 'WAITING', currentQuestionId: null, endsAt: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<DevTeacherPanel />);
    await screen.findByText('等待開放');
    await user.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({ method: 'POST' })));
  });

  it('伺服器拒絕時顯示 message 與 hint', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'GET /api/dev/teacher/status': () => json(status()),
        'POST /api/dev/teacher/next': () =>
          json(
            { error: { code: 'INVALID_TRANSITION', field: null, message: '目前階段（等待開放）不能執行「下一題」', hint: '只有在「已結束」階段可以執行' } },
            409,
          ),
      }),
    );
    const user = userEvent.setup();
    render(<DevTeacherPanel />);
    await screen.findByText('等待開放');
    await user.click(screen.getByRole('button', { name: '下一題' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('目前階段（等待開放）不能執行「下一題」');
    expect(alert).toHaveTextContent('只有在「已結束」階段可以執行');
  });

  it('秒數超出 5–600 時前端提示並停用開放按鈕', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /api/dev/teacher/status': () => json(status()) }));
    const user = userEvent.setup();
    render(<DevTeacherPanel />);
    await screen.findByText('等待開放');
    const seconds = screen.getByLabelText('作答秒數');
    await user.clear(seconds);
    await user.type(seconds, '601');
    expect(screen.getByText('作答秒數必須是 5–600 的整數')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開放題目' })).toBeDisabled();
  });
});
