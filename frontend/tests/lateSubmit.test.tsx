import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { tokenStore } from '../src/api/client';
import { StudentPage } from '../src/pages/StudentPage';
import { answeringView, createFakeSocket, json, routeFetch } from './helpers';

const err = (code: string, message: string, hint: string, status = 409) =>
  json({ error: { code, field: null, message, hint } }, status);

beforeEach(() => tokenStore.set('tok'));
afterEach(() => vi.unstubAllGlobals());

async function renderAnswering(postResponse: () => Response) {
  vi.stubGlobal(
    'fetch',
    routeFetch({
      'GET /api/student/state': () => json(answeringView()),
      'POST /api/student/submissions': postResponse,
    }),
  );
  const sock = createFakeSocket();
  render(
    <MemoryRouter>
      <StudentPage socketFactory={sock.factory} />
    </MemoryRouter>,
  );
  sock.connection('online');
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('你的答案'), '太晚的答案');
  await user.click(screen.getByRole('button', { name: '送出答案' }));
  return sock;
}

describe('結束後送出被拒（US3、FR-011、FR-014a）', () => {
  it('API 回 QUESTION_CLOSED：顯示訊息、按鈕維持停用；收到 CLOSED 後切換到結果畫面', async () => {
    const sock = await renderAnswering(() =>
      err('QUESTION_CLOSED', '本題搶答已結束，無法再送出答案', '請查看本題結果'),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('本題搶答已結束，無法再送出答案');
    expect(screen.getByRole('button', { name: '送出答案' })).toBeDisabled();

    sock.push({
      ...answeringView(),
      phase: 'CLOSED',
      endsAt: undefined,
      results: [{ rank: 1, teamName: '第 2 組', answer: 'B', isWinner: true }],
      myTeamOutcome: 'NOT_SUBMITTED',
    });
    expect(await screen.findByText('本組未送出，搶答未成功')).toBeInTheDocument();
    expect(screen.queryByLabelText('你的答案')).not.toBeInTheDocument();
  });

  it.each([
    ['ALREADY_SUBMITTED', '本組已送出過此題答案，每組每題只能送出一次'],
    ['QUESTION_NOT_OPEN', '此題目目前未開放作答'],
    ['ACTIVITY_ENDED', '活動已結束'],
  ])('%s：按鈕維持停用並顯示訊息', async (code, message) => {
    await renderAnswering(() => err(code, message, '提示'));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: '送出答案' })).toBeDisabled();
  });

  it('EMPTY_ANSWER 等驗證錯誤：按鈕恢復可送出', async () => {
    await renderAnswering(() => err('EMPTY_ANSWER', '答案不可為空', '請輸入內容後再送出', 400));
    expect(await screen.findByRole('alert')).toHaveTextContent('答案不可為空');
    expect(screen.getByRole('button', { name: '送出答案' })).toBeEnabled();
  });
});
