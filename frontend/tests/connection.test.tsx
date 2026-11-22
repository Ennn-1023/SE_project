import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { tokenStore } from '../src/api/client';
import { StudentPage } from '../src/pages/StudentPage';
import { answeringView, createFakeSocket, json, routeFetch } from './helpers';

beforeEach(() => tokenStore.set('tok'));
afterEach(() => vi.unstubAllGlobals());

function renderPage(routes: Parameters<typeof routeFetch>[0]) {
  const fetchMock = routeFetch(routes);
  vi.stubGlobal('fetch', fetchMock);
  const sock = createFakeSocket();
  render(
    <MemoryRouter>
      <StudentPage socketFactory={sock.factory} />
    </MemoryRouter>,
  );
  return { sock, fetchMock };
}

describe('斷線與重連（US4、FR-005、Q-T19）', () => {
  it('斷線時顯示提示並停用送出；重連並收到新狀態後恢復', async () => {
    const { sock, fetchMock } = renderPage({ 'GET /api/student/state': () => json(answeringView()) });
    sock.connection('online');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('你的答案'), '答案');
    expect(screen.getByRole('button', { name: '送出答案' })).toBeEnabled();

    sock.connection('offline');
    expect(screen.getByRole('alert')).toHaveTextContent('連線中斷，正在重新連線，請稍後再送出');
    expect(screen.getByRole('button', { name: '送出答案' })).toBeDisabled();

    const callsBefore = fetchMock.mock.calls.length;
    sock.connection('online');
    sock.push(answeringView());
    expect(screen.queryByText(/連線中斷/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '送出答案' })).toBeEnabled();
    // 重連後會再取回一次狀態作為保險
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('送出時網路錯誤：不會顯示為已送出，可以再試一次', async () => {
    const { sock } = renderPage({
      'GET /api/student/state': () => json(answeringView()),
      'POST /api/student/submissions': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    sock.connection('online');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('你的答案'), '答案');
    await user.click(screen.getByRole('button', { name: '送出答案' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法連線到伺服器');
    expect(screen.queryByText('本組已送出')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '送出答案' })).toBeEnabled();
  });

  it('重連後收到不同階段（已結束）時直接切換畫面', async () => {
    // 模擬伺服器：斷線期間題目結束，之後 GET 也回傳已結束
    let server = answeringView();
    const { sock } = renderPage({ 'GET /api/student/state': () => json({ ...server, serverNow: new Date().toISOString() }) });
    sock.connection('online');
    await screen.findByLabelText('你的答案');
    sock.connection('offline');
    server = { ...answeringView(), phase: 'CLOSED', endsAt: undefined, results: [], myTeamOutcome: 'NOT_SUBMITTED' };
    sock.connection('online');
    sock.push({ ...server, serverNow: new Date().toISOString() });
    expect(await screen.findByText('本題無組別送出答案')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('本題無組別送出答案')).toBeInTheDocument();
  });

  it('較舊的狀態（伺服器時間較早）不會蓋掉較新的推播', async () => {
    const old = new Date(Date.now() - 5_000).toISOString();
    let resolveGet!: (r: Response) => void;
    const { sock } = renderPage({
      'GET /api/student/state': () => new Promise<Response>((r) => (resolveGet = r)),
    });
    sock.connection('online');
    sock.push({ ...answeringView(), phase: 'CLOSED', endsAt: undefined, results: [], myTeamOutcome: 'NOT_SUBMITTED' });
    expect(await screen.findByText('本題無組別送出答案')).toBeInTheDocument();
    resolveGet(json(answeringView({ serverNow: old })));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('本題無組別送出答案')).toBeInTheDocument();
    expect(screen.queryByLabelText('你的答案')).not.toBeInTheDocument();
  });

  it('token 失效（UNAUTHORIZED）時清除 token', async () => {
    const { sock } = renderPage({
      'GET /api/student/state': () =>
        json({ error: { code: 'UNAUTHORIZED', field: null, message: '尚未登入或登入已過期', hint: '請重新登入' } }, 401),
    });
    sock.connection('offline', 'UNAUTHORIZED');
    await vi.waitFor(() => expect(tokenStore.get()).toBeNull());
  });
});
