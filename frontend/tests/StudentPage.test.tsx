import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { StudentView } from '@buzzer/shared';
import { StudentPage } from '../src/pages/StudentPage';
import { answeringView, createFakeSocket, json, routeFetch } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const waiting = (t: number): StudentView => ({ phase: 'WAITING', serverNow: at(t), myTeam: { teamId: 'T1', name: '第 1 組' } });

function renderPage() {
  const sock = createFakeSocket();
  render(
    <MemoryRouter initialEntries={['/student/buzzer']}>
      <Routes>
        <Route path="/student/buzzer" element={<StudentPage socketFactory={sock.factory} />} />
        <Route path="/login" element={<p>登入頁</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return sock;
}

describe('StudentPage 階段切換（FR-001、Q-T17、Edge Cases「連續多題」）', () => {

  it('四種階段依序切換，下一題不會帶到上一題的已送出狀態與草稿', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /api/student/state': () => json(waiting(-60_000)) }));
    const sock = renderPage();
    sock.connection('online');
    expect(await screen.findByText('等待老師開放題目')).toBeInTheDocument();
    expect(screen.getByText('第 1 組')).toBeInTheDocument();

    sock.push(answeringView({ serverNow: at(1), myTeamSubmission: { answer: 'Q1 已送出' } }));
    expect(screen.getByText('本組已送出')).toBeInTheDocument();

    sock.push({
      ...answeringView({ serverNow: at(2), myTeamSubmission: { answer: 'Q1 已送出' } }),
      phase: 'CLOSED',
      endsAt: undefined,
      results: [{ rank: 1, teamName: '第 1 組', answer: 'Q1 已送出', isWinner: true }],
      myTeamOutcome: 'WIN',
    });
    expect(screen.getByText('本組搶答成功')).toBeInTheDocument();

    sock.push(waiting(3));
    expect(screen.getByText('等待老師開放題目')).toBeInTheDocument();

    sock.push(answeringView({ serverNow: at(4), question: { questionId: 'Q2', number: 2, text: '題目二' } }));
    expect(screen.getByText('第 2 題')).toBeInTheDocument();
    expect(screen.queryByText('本組已送出')).not.toBeInTheDocument();
    const input = screen.getByLabelText('你的答案');
    expect(input).toHaveValue('');

    const user = userEvent.setup();
    await user.type(input, 'Q2 草稿');
    sock.push(answeringView({ serverNow: at(5), question: { questionId: 'Q3', number: 3, text: '題目三' } }));
    expect(screen.getByLabelText('你的答案')).toHaveValue('');

    sock.push({ phase: 'ENDED', serverNow: at(6), myTeam: { teamId: 'T1', name: '第 1 組' } });
    expect(screen.getByText('活動已結束，感謝參與')).toBeInTheDocument();
  });

  it('未分組學生顯示「尚未分組」', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /api/student/state': () => json({ ...waiting(0), myTeam: null }) }));
    const sock = renderPage();
    sock.connection('online');
    expect(await screen.findByText('尚未分組')).toBeInTheDocument();
  });
});

describe('StudentPage 登入失效', () => {
  it('取回狀態得到 401 時導向 /login', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch({
        'GET /api/student/state': () =>
          json({ error: { code: 'UNAUTHENTICATED', message: '請先登入', hint: '請回到登入頁重新登入' } }, 401),
      }),
    );
    renderPage();
    expect(await screen.findByText('登入頁')).toBeInTheDocument();
  });

  it('沒有進行中的活動時顯示提示，不顯示作答區（004 US1-6、FR-030）', async () => {
    const none: StudentView = { phase: 'NO_ACTIVITY', serverNow: at(0), myTeam: { teamId: 'T1', name: '第 1 組' } };
    vi.stubGlobal('fetch', routeFetch({ 'GET /api/student/state': () => json(none) }));
    const sock = renderPage();
    sock.connection('online');
    expect(await screen.findByText('目前沒有進行中的活動，請等待老師開始')).toBeInTheDocument();
    expect(screen.queryByLabelText('你的答案')).not.toBeInTheDocument();
    sock.push(waiting(1));
    expect(screen.getByText('等待老師開放題目')).toBeInTheDocument();
  });
});

describe('StudentPage 斷線提示列與倒數列堆疊（007 research R6）', () => {
  it('斷線時提示列是 main.page 之前的兄弟元素，倒數列才能停在提示列下方', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /api/student/state': () => json(answeringView()) }));
    const sock = renderPage();
    sock.connection('online');
    expect(await screen.findByLabelText('你的答案')).toBeInTheDocument();
    sock.connection('offline');
    const banner = screen.getByRole('alert');
    expect(banner).toHaveClass('connection-banner');
    const main = screen.getByRole('main');
    expect(main).toHaveClass('page');
    expect(banner.nextElementSibling).toBe(main);
    expect(main.querySelector('.answering-head')).not.toBeNull();
  });
});
