import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { StudentView } from '@buzzer/shared';
import { tokenStore } from '../src/api/client';
import { StudentPage } from '../src/pages/StudentPage';
import { answeringView, createFakeSocket, json, routeFetch } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const waiting = (t: number): StudentView => ({ phase: 'WAITING', serverNow: at(t), myTeam: { teamId: 'T1', name: '第 1 組' } });

function renderPage() {
  const sock = createFakeSocket();
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<StudentPage socketFactory={sock.factory} />} />
        <Route path="/dev" element={<p>dev 登入頁</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return sock;
}

describe('StudentPage 階段切換（FR-001、Q-T17、Edge Cases「連續多題」）', () => {
  beforeEach(() => tokenStore.set('tok'));

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

describe('StudentPage 沒有登入', () => {
  it('沒有 token 時導向 /dev', () => {
    tokenStore.clear();
    renderPage();
    expect(screen.getByText('dev 登入頁')).toBeInTheDocument();
  });
});
