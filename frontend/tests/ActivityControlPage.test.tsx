import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/apiClient';
import { ActivityControlPage } from '../src/pages/ActivityControlPage';
import {
  createFakeTeacherSocket,
  detail,
  listItem,
  noneView,
  readiness,
  resultView,
  teacherView,
} from './activityFixtures';
import { mockMe, renderAt, teacherUser } from './utils';

beforeEach(() => mockMe(teacherUser));
afterEach(() => vi.restoreAllMocks());

function renderPage() {
  const sock = createFakeTeacherSocket();
  renderAt('/teacher/activity', <ActivityControlPage socketFactory={sock.factory} />);
  return sock;
}

describe('ActivityControlPage：開始活動（004 US1）', () => {
  it('NONE：顯示題目集來源、題數、組數與各組人數，按「開始活動」後顯示題目清單（US1-1、US1-2）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(noneView());
    const start = vi.spyOn(api, 'startActivity').mockResolvedValue(teacherView());
    const sock = renderPage();
    sock.connection('online');

    expect(await screen.findByText('題目集：測試學習單／學習單，3 題')).toBeInTheDocument();
    expect(screen.getByText('參與組別：2 組')).toBeInTheDocument();
    expect(screen.getByText('第 1 組：2 人（在線 1）')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: '開始活動' }));
    expect(start).toHaveBeenCalledOnce();
    expect(await screen.findByText('已完成 0／3 題', { selector: '[data-testid="progress"]' })).toBeInTheDocument();
    expect(screen.getAllByText('未開放')).toHaveLength(3);
    expect(screen.getByTestId('phase')).toHaveTextContent('等待開放');
  });

  it('尚未匯入題目：按鈕停用並提供前往題目管理的連結（US1-3）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(
      noneView({ readiness: readiness({ questionCount: 0, sourceTitle: null }) }),
    );
    renderPage().connection('online');
    expect(await screen.findByText('尚未匯入題目')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前往題目管理' })).toHaveAttribute('href', '/teacher/questions');
    expect(screen.getByRole('button', { name: '開始活動' })).toBeDisabled();
  });

  it('沒有組別有學生：按鈕停用並提供前往組別管理的連結（US1-4）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(
      noneView({
        readiness: readiness({ teams: [{ teamId: 'T1', name: '第 1 組', members: 0, online: 0 }] }),
      }),
    );
    renderPage().connection('online');
    expect(await screen.findByText('尚無任何組別有學生')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前往組別管理' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開始活動' })).toBeDisabled();
  });

  it('伺服器拒絕時顯示原因與修正方式', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(noneView());
    vi.spyOn(api, 'startActivity').mockRejectedValue(
      new ApiError(409, 'NO_QUESTION_SET', '尚未匯入題目', undefined, '請先到題目管理匯入學習單'),
    );
    renderPage().connection('online');
    await userEvent.setup().click(await screen.findByRole('button', { name: '開始活動' }));
    await waitFor(() => expect(screen.getByText('請先到題目管理匯入學習單')).toBeInTheDocument());
  });

  it('推播的 teacher:update 會更新畫面', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(noneView());
    const sock = renderPage();
    sock.connection('online');
    await screen.findByRole('button', { name: '開始活動' });
    sock.push(teacherView());
    expect(screen.getByTestId('phase')).toHaveTextContent('等待開放');
  });
});

describe('ActivityControlPage：結束活動與恢復（004 US5）', () => {
  it('結束活動的確認視窗說明未開放題數；取消不送出（US5-1）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(
      teacherView({ questions: [listItem(1, { status: 'CLOSED', round: 1 }), listItem(2), listItem(3)] }),
    );
    const end = vi.spyOn(api, 'endActivity').mockResolvedValue(teacherView({ phase: 'ENDED' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage().connection('online');
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: '結束活動' });
    expect(button).toHaveAttribute('data-variant', 'danger');
    await user.click(button);
    expect(confirm).toHaveBeenCalledWith('尚有 2 題未開放，結束後無法再開放本場題目。確定結束活動？');
    expect(end).not.toHaveBeenCalled();
    await user.click(button);
    expect(end).toHaveBeenCalledOnce();
  });

  it('作答中結束活動的確認文案提到會先結束本題（US5-2）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(
      teacherView({
        phase: 'ANSWERING',
        current: detail(1),
        endsAt: new Date(Date.now() + 30_000).toISOString(),
        monitor: { questionId: 'ACT-1-1', round: 1, submittedCount: 0, teamCount: 0, allSubmitted: false, teams: [] },
        questions: [listItem(1, { status: 'ANSWERING', round: 1 })],
      }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage().connection('online');
    await userEvent.setup().click(await screen.findByRole('button', { name: '結束活動' }));
    expect(confirm.mock.calls[0]![0]).toContain('目前題目作答中，結束活動會先結束本題並保留已送出的答案。');
  });

  it('ENDED：顯示摘要、可查看結果，並可確認後開始新活動（US5-3、US5-4）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(
      teacherView({
        phase: 'ENDED',
        readiness: readiness(),
        questions: [listItem(1, { status: 'CLOSED', round: 1, winnerTeamName: '第 2 組' }), listItem(2), listItem(3)],
        progress: { closed: 1, total: 3 },
        preselectedQuestionId: null,
      }),
    );
    const result = vi.spyOn(api, 'getQuestionResult').mockResolvedValue(resultView());
    const start = vi.spyOn(api, 'startActivity').mockResolvedValue(teacherView());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage().connection('online');
    const user = userEvent.setup();
    expect(await screen.findByText('活動已結束：共 3 題，已完成 1 題')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '第 2 組搶答成功（查看結果）' }));
    expect(result).toHaveBeenCalledWith('ACT-1-1');
    expect(await screen.findByRole('dialog', { name: '第 1 題結果' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '關閉' }));
    await user.click(screen.getByRole('button', { name: '開始新活動' }));
    expect(start).toHaveBeenCalledOnce();
  });

  it('斷線時顯示提示並停用所有操作（FR-025）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(teacherView());
    const open = vi.spyOn(api, 'openQuestion');
    const sock = renderPage();
    sock.connection('online');
    await screen.findByRole('button', { name: '開始搶答' });
    sock.connection('offline');
    expect(screen.getByRole('alert')).toHaveTextContent('連線中斷，正在重新連線，請稍後再操作');
    expect(screen.getByRole('button', { name: '開始搶答' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '結束活動' })).toBeDisabled();
    expect(open).not.toHaveBeenCalled();
  });

  it('重新連線後以 GET 取回最新狀態（FR-024）', async () => {
    const get = vi.spyOn(api, 'getActivity').mockResolvedValue(teacherView());
    const sock = renderPage();
    sock.connection('online');
    await screen.findByRole('button', { name: '開始搶答' });
    const calls = get.mock.calls.length;
    sock.connection('offline');
    sock.connection('online');
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(calls));
  });

  it('notice（重啟取消作答）以提示框顯示（US5-6）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(
      teacherView({ notice: '伺服器重新啟動，第 2 題作答已取消，可重新開放' }),
    );
    renderPage().connection('online');
    expect(await screen.findByText('伺服器重新啟動，第 2 題作答已取消，可重新開放')).toBeInTheDocument();
  });

  it('CLOSED：結果在上、預選下一題的開放表單在下；開放後清單可改選其他未開放題目', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(
      teacherView({
        phase: 'CLOSED',
        current: detail(1),
        result: resultView(),
        questions: [listItem(1, { status: 'CLOSED', round: 1, winnerTeamName: '第 2 組' }), listItem(2), listItem(3)],
        progress: { closed: 1, total: 3 },
        preselectedQuestionId: 'ACT-1-2',
      }),
    );
    const open = vi.spyOn(api, 'openQuestion').mockResolvedValue(teacherView({ phase: 'ANSWERING' }));
    renderPage().connection('online');
    const user = userEvent.setup();
    expect(await screen.findByText('第 1 題結果')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: '開放題目' })).toHaveTextContent('第 2 題（題組）');
    await user.click(screen.getByRole('button', { name: /第 3 題/ }));
    expect(screen.getByRole('form', { name: '開放題目' })).toHaveTextContent('第 3 題');
    await user.click(screen.getByRole('button', { name: '開始搶答' }));
    expect(open).toHaveBeenCalledWith('ACT-1-3', 60);
  });
});

describe('ActivityControlPage：載入失敗', () => {
  it('取得狀態失敗時顯示錯誤', async () => {
    vi.spyOn(api, 'getActivity').mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', '系統發生錯誤，請稍後再試', undefined, '若持續發生請通知老師'),
    );
    renderPage();
    expect(await screen.findByText('系統發生錯誤，請稍後再試')).toBeInTheDocument();
  });
});

describe('ActivityControlPage：session 逾時（004 Edge Case、T081）', () => {
  it('老師連線因登入失效被拒時，重新以 REST 取得狀態（401 會導向登入頁），不停在連線中斷', async () => {
    const get = vi
      .spyOn(api, 'getActivity')
      .mockResolvedValueOnce(teacherView())
      .mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', '請先登入', undefined, '請回到登入頁重新登入'));
    const sock = renderPage();
    sock.connection('online');
    await screen.findByRole('button', { name: '開始搶答' });
    const calls = get.mock.calls.length;
    sock.connection('offline', 'UNAUTHORIZED');
    await waitFor(() => expect(get.mock.calls.length).toBe(calls + 1));
  });

  it('一般斷線（非登入失效）不會額外重新取得狀態', async () => {
    const get = vi.spyOn(api, 'getActivity').mockResolvedValue(teacherView());
    const sock = renderPage();
    sock.connection('online');
    await screen.findByRole('button', { name: '開始搶答' });
    const calls = get.mock.calls.length;
    sock.connection('offline', 'transport close');
    await new Promise((r) => setTimeout(r, 50));
    expect(get.mock.calls.length).toBe(calls);
  });
});


describe('ActivityControlPage：寫回與匯出入口（005 US4、FR-026）', () => {
  it('從未開始活動：兩個入口停用並說明原因（US4-2）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(noneView());
    renderPage().connection('online');
    expect(await screen.findByText('尚無搶答活動結果可寫回或匯出')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '寫回 Google 試算表' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '匯出結果 CSV' })).toBeDisabled();
  });

  it('活動進行中也可使用：按「寫回 Google 試算表」開啟預覽對話框（FR-002）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(teacherView({ phase: 'ANSWERING' }));
    const preview = vi.spyOn(api, 'writebackPreview').mockReturnValue(new Promise(() => undefined));
    renderPage().connection('online');
    const button = await screen.findByRole('button', { name: '寫回 Google 試算表' });
    expect(button).toBeEnabled();
    expect(screen.getByRole('button', { name: '匯出結果 CSV' })).toBeEnabled();
    await userEvent.setup().click(button);
    expect(screen.getByRole('dialog', { name: '寫回 Google 試算表' })).toBeInTheDocument();
    expect(preview).toHaveBeenCalledOnce();
  });

  it('活動結束摘要醒目提供寫回與匯出（FR-026）', async () => {
    vi.spyOn(api, 'getActivity').mockResolvedValue(teacherView({ phase: 'ENDED' }));
    const download = vi.spyOn(api, 'downloadResultsCsv').mockResolvedValue('搶答結果.csv');
    renderPage().connection('online');
    const summary = await screen.findByLabelText('保存本場結果');
    expect(within(summary).getByRole('button', { name: '寫回 Google 試算表' })).toBeEnabled();
    await userEvent.setup().click(within(summary).getByRole('button', { name: '匯出結果 CSV' }));
    expect(download).toHaveBeenCalledOnce();
  });
});
