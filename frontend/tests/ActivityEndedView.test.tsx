import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { StudentView } from '@buzzer/shared';
import { ActivityEndedView } from '../src/components/ActivityEndedView';
import { StudentPage } from '../src/pages/StudentPage';
import { createFakeSocket, json, routeFetch } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const ended: StudentView = {
  phase: 'ENDED',
  serverNow: new Date().toISOString(),
  myTeam: { teamId: 'T1', name: '第 1 組' },
};

describe('活動結束畫面（US5）', () => {
  it('顯示「活動已結束，感謝參與」', () => {
    render(<ActivityEndedView />);
    expect(screen.getByRole('heading', { name: '活動已結束，感謝參與' })).toBeInTheDocument();
  });

  it('phase 為 ENDED 時，學生頁顯示結束畫面而且沒有作答區', async () => {
    vi.stubGlobal('fetch', routeFetch({ 'GET /api/student/state': () => json(ended) }));
    const sock = createFakeSocket();
    render(
      <MemoryRouter>
        <StudentPage socketFactory={sock.factory} />
      </MemoryRouter>,
    );
    sock.connection('online');
    expect(await screen.findByText('活動已結束，感謝參與')).toBeInTheDocument();
    expect(screen.queryByLabelText('你的答案')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '送出答案' })).not.toBeInTheDocument();
  });
});
