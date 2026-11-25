import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/apiClient';
import { draftView, LINK, questionSetView } from './questionFixtures';
import { QuestionManagePage } from '../src/pages/QuestionManagePage';
import { mockMe, renderAt, teacherUser } from './utils';

beforeEach(() => {
  mockMe(teacherUser);
  vi.spyOn(api, 'getGoogleStatus').mockResolvedValue({
    configured: true,
    connected: true,
    googleEmail: 't@example.edu',
  });
  vi.spyOn(api, 'getCurrentDraft').mockResolvedValue({ draft: null });
  vi.spyOn(api, 'getQuestionSet').mockResolvedValue({ questionSet: null });
});
afterEach(() => vi.restoreAllMocks());

const renderPage = () => renderAt('/teacher/questions', <QuestionManagePage />);

async function submitLink(link: string) {
  const user = userEvent.setup();
  const input = await screen.findByLabelText('學習單連結');
  await user.clear(input);
  await user.type(input, link);
  await user.click(screen.getByRole('button', { name: '讀取學習單' }));
  return user;
}

describe('QuestionManagePage：讀取學習單（US1）', () => {
  it('不是試算表連結時在前端擋下，不呼叫 API（邊界）', async () => {
    const create = vi.spyOn(api, 'createDraft');
    renderPage();
    await submitLink('https://docs.google.com/document/d/abc/edit');
    expect(await screen.findByText('請貼上 Google 試算表連結')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('讀取成功後顯示學習單格子（正常）', async () => {
    const create = vi.spyOn(api, 'createDraft').mockResolvedValue({ draft: draftView() });
    renderPage();
    await submitLink(LINK);
    expect(create).toHaveBeenCalledWith(LINK, undefined);
    expect(await screen.findByRole('gridcell', { name: /^C5/ })).toHaveTextContent('虛構題目一？');
    expect(screen.getByText(/虛構學習單／學習單/)).toBeInTheDocument();
  });

  it('後端錯誤顯示原因與修正方式', async () => {
    vi.spyOn(api, 'createDraft').mockRejectedValue(
      new ApiError(
        403,
        'SHEET_FORBIDDEN',
        '你連結的 Google 帳號沒有這份試算表的檢視權限',
        undefined,
        '請確認連結，或請擁有者將試算表分享給你',
      ),
    );
    renderPage();
    await submitLink(LINK);
    expect(
      await screen.findByText('你連結的 Google 帳號沒有這份試算表的檢視權限'),
    ).toBeInTheDocument();
    expect(screen.getByText('請確認連結，或請擁有者將試算表分享給你')).toBeInTheDocument();
  });

  it('分頁不存在時列出可選分頁，選擇後以 sheetId 重新讀取', async () => {
    const create = vi
      .spyOn(api, 'createDraft')
      .mockRejectedValueOnce(
        new ApiError(
          404,
          'SHEET_TAB_NOT_FOUND',
          '找不到指定的分頁',
          undefined,
          '請從列出的分頁中選擇',
          {
            sheets: [
              { sheetId: 0, title: '說明' },
              { sheetId: 11, title: '第一單元' },
            ],
          },
        ),
      )
      .mockResolvedValueOnce({ draft: draftView() });
    renderPage();
    const user = await submitLink(LINK);
    const select = await screen.findByLabelText('分頁');
    await user.selectOptions(select, '11');
    await user.click(screen.getByRole('button', { name: '讀取學習單' }));
    await waitFor(() => expect(create).toHaveBeenLastCalledWith(LINK, 11));
  });

  it('試算表有多個分頁時可切換分頁重新讀取', async () => {
    const sheets = [
      { sheetId: 0, title: '學習單' },
      { sheetId: 22, title: '第二單元' },
    ];
    const create = vi
      .spyOn(api, 'createDraft')
      .mockResolvedValueOnce({ draft: draftView({ sheets }) })
      .mockResolvedValueOnce({
        draft: draftView({
          sheets,
          source: { ...draftView().source, sheetId: 22, sheetTitle: '第二單元' },
        }),
      });
    renderPage();
    const user = await submitLink(LINK);
    await screen.findByRole('gridcell', { name: /^C5/ });
    await user.selectOptions(screen.getByLabelText('分頁'), '22');
    await user.click(screen.getByRole('button', { name: '讀取學習單' }));
    await waitFor(() => expect(create).toHaveBeenLastCalledWith(LINK, 22));
    expect(await screen.findByText(/虛構學習單／第二單元/)).toBeInTheDocument();
  });

  it('進入頁面時續作未過期的草稿（FR-021），並顯示已標註的角標', async () => {
    vi.mocked(api.getCurrentDraft).mockResolvedValue({
      draft: draftView({
        revision: 3,
        annotations: {
          questions: [
            {
              key: 'qa01',
              label: '1',
              labelManual: false,
              kind: 'SINGLE',
              stemCell: null,
              parts: [{ questionCell: 'C5', answerCell: 'G5' }],
            },
          ],
        },
      }),
    });
    renderPage();
    expect(await screen.findByRole('gridcell', { name: /^C5/ })).toHaveTextContent('題1');
    expect(screen.getByRole('listitem', { name: '第 1 題' })).toBeInTheDocument();
  });

  it('多題草稿：格線顯示所有角標，但只有目前這一題標為 current；切題不觸發自動儲存（006 FR-021、FR-024）', async () => {
    const q = (key: string, label: string, questionCell: string, answerCell: string) => ({
      key,
      label,
      labelManual: false,
      kind: 'SINGLE' as const,
      stemCell: null,
      parts: [{ questionCell, answerCell }],
    });
    vi.mocked(api.getCurrentDraft).mockResolvedValue({
      draft: draftView({
        revision: 3,
        annotations: { questions: [q('qa01', '1', 'C5', 'G5'), q('qa02', '2', 'C7', 'G7')] },
      }),
    });
    const save = vi.spyOn(api, 'saveAnnotations');
    renderPage();
    const c5 = await screen.findByRole('gridcell', { name: /^C5/ });
    const c7 = screen.getByRole('gridcell', { name: /^C7/ });
    expect(c5).toHaveTextContent('題1');
    expect(c7).toHaveTextContent('題2');
    expect(c5).toHaveAttribute('data-current', 'true');
    expect(c7).not.toHaveAttribute('data-current');
    await userEvent.setup().click(screen.getByRole('button', { name: '下一題' }));
    expect(c7).toHaveAttribute('data-current', 'true');
    expect(c5).not.toHaveAttribute('data-current');
    // 逐題切換只改變呈現，不改標註資料，因此不會送出自動儲存
    await new Promise((r) => setTimeout(r, 900));
    expect(save).not.toHaveBeenCalled();
  });

  it('未連結 Google 時讀取按鈕停用', async () => {
    vi.mocked(api.getGoogleStatus).mockResolvedValue({ configured: true, connected: false });
    renderPage();
    expect(await screen.findByRole('button', { name: '連結 Google 帳號' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '讀取學習單' })).toBeDisabled();
  });
});

describe('QuestionManagePage：預覽與確認匯入（US3）', () => {
  const annotated = () =>
    draftView({
      annotations: {
        questions: [
          {
            key: 'qa01',
            label: '1',
            labelManual: false,
            kind: 'SINGLE',
            stemCell: null,
            parts: [{ questionCell: 'C5', answerCell: null }],
          },
        ],
      },
    });

  it('有未完成的題目時列出所有問題，不進入預覽', async () => {
    vi.mocked(api.getCurrentDraft).mockResolvedValue({ draft: annotated() });
    vi.spyOn(api, 'previewImport').mockRejectedValue(
      new ApiError(
        422,
        'ANNOTATION_INVALID',
        '標註尚未完成或有錯誤（共 1 項）',
        undefined,
        '請依清單逐項修正後再預覽',
        {
          issues: [
            {
              code: 'MISSING_ANSWER_CELL',
              message: '第 1 題缺少作答格',
              hint: '請點選該題的作答格',
            },
          ],
          totalIssues: 1,
        },
      ),
    );
    renderPage();
    await userEvent.setup().click(await screen.findByRole('button', { name: '預覽匯入' }));
    expect(await screen.findByText('標註尚未完成或有錯誤（共 1 項）')).toBeInTheDocument();
    expect(screen.getByText(/第 1 題缺少作答格（請點選該題的作答格）/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '確認匯入' })).toBeNull();
  });

  it('預覽 → 確認匯入 → 顯示「已匯入 N 題」與目前題目集（正常）', async () => {
    vi.mocked(api.getCurrentDraft).mockResolvedValue({ draft: annotated() });
    vi.spyOn(api, 'previewImport').mockResolvedValue({
      preview: questionSetView(),
      replaces: null,
    });
    vi.spyOn(api, 'confirmImport').mockResolvedValue({
      questionSet: questionSetView({ importedAt: '2026-11-24T02:30:00.000Z' }),
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '預覽匯入' }));
    expect(await screen.findByRole('heading', { name: '預覽匯入' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '確認匯入' }));
    expect(await screen.findByText('已匯入 2 題')).toBeInTheDocument();
    expect(screen.queryByRole('grid', { name: '學習單格子' })).toBeNull();
    expect(screen.getByRole('listitem', { name: '第 1 題' })).toBeInTheDocument();
  });

  it('進入頁面時顯示目前題目集', async () => {
    vi.mocked(api.getQuestionSet).mockResolvedValue({
      questionSet: questionSetView({ importedAt: '2026-11-24T02:30:00.000Z' }),
    });
    renderPage();
    expect(await screen.findByText(/虛構題組學習單／學習單/)).toBeInTheDocument();
  });
});

describe('QuestionManagePage：帶回標註與重新匯入（US4）', () => {
  const restoredDraft = () =>
    draftView({
      restoredCount: 2,
      annotations: {
        questions: [
          {
            key: 'qa01',
            label: '1',
            labelManual: false,
            kind: 'SINGLE',
            stemCell: null,
            parts: [{ questionCell: 'C5', answerCell: 'G5' }],
          },
          {
            key: 'qa02',
            label: '2',
            labelManual: false,
            kind: 'SINGLE',
            stemCell: null,
            parts: [{ questionCell: 'C7', answerCell: null }],
          },
        ],
      },
      validation: {
        issues: [],
        warnings: [
          {
            code: 'RESTORED_CELL_MISSING',
            questionKey: 'qa02',
            message: '第 2 題的作答格已不存在，請重新指定',
            hint: '學習單的列或欄可能已被刪除',
          },
        ],
        totalIssues: 0,
      },
    });

  it('顯示「已帶回上次的標註（N 題）」與無法對應的提醒', async () => {
    vi.mocked(api.getCurrentDraft).mockResolvedValue({ draft: restoredDraft() });
    renderPage();
    expect(await screen.findByText('已帶回上次的標註（2 題）')).toBeInTheDocument();
    expect(screen.getByText(/第 2 題的作答格已不存在，請重新指定/)).toBeInTheDocument();
  });

  it('「清除所有標註重新開始」需確認，確認後清空並自動儲存', async () => {
    vi.mocked(api.getCurrentDraft).mockResolvedValue({ draft: restoredDraft() });
    const save = vi.spyOn(api, 'saveAnnotations').mockResolvedValue({
      revision: 1,
      annotations: { questions: [] },
      validation: { issues: [], warnings: [], totalIssues: 0 },
      expiresAt: new Date().toISOString(),
    });
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderPage();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: '清除所有標註重新開始' });
    await user.click(button);
    expect(screen.getByRole('listitem', { name: '第 1 題' })).toBeInTheDocument();
    await user.click(button);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('尚未標註任何題目，請按「新增題目」開始')).toBeInTheDocument();
    await waitFor(
      () => expect(save).toHaveBeenCalledWith(expect.any(String), 0, { questions: [] }),
      {
        timeout: 3000,
      },
    );
  });

  it('目前題目集的「重新匯入」重新讀取來源並進入標註', async () => {
    vi.mocked(api.getQuestionSet).mockResolvedValue({
      questionSet: questionSetView({ importedAt: '2026-11-24T02:30:00.000Z' }),
    });
    const re = vi.spyOn(api, 'reimportQuestionSet').mockResolvedValue({ draft: restoredDraft() });
    renderPage();
    await userEvent.setup().click(await screen.findByRole('button', { name: '重新匯入' }));
    expect(re).toHaveBeenCalled();
    expect(await screen.findByText('已帶回上次的標註（2 題）')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: '學習單格子' })).toBeInTheDocument();
  });
});

describe('QuestionManagePage：清除題目集與中斷連結（US5）', () => {
  beforeEach(() => {
    vi.mocked(api.getQuestionSet).mockResolvedValue({
      questionSet: questionSetView({ importedAt: '2026-11-24T02:30:00.000Z' }),
    });
  });

  it('「清除題目集」需確認；取消不變，確認後顯示空狀態', async () => {
    const clear = vi.spyOn(api, 'clearQuestionSet').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: '清除題目集' });
    await user.click(button);
    expect(clear).not.toHaveBeenCalled();
    expect(screen.getByRole('listitem', { name: '第 1 題' })).toBeInTheDocument();
    await user.click(button);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('尚未匯入任何題目，請貼上學習單連結開始匯入'),
    ).toBeInTheDocument();
  });

  it('中斷 Google 連結後，目前題目集仍然顯示', async () => {
    vi.mocked(api.getGoogleStatus)
      .mockResolvedValueOnce({ configured: true, connected: true, googleEmail: 't@example.edu' })
      .mockResolvedValueOnce({ configured: true, connected: false });
    vi.spyOn(api, 'disconnectGoogle').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '中斷 Google 連結' }));
    expect(await screen.findByRole('button', { name: '連結 Google 帳號' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '第 1 題' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新匯入' })).toBeDisabled();
  });
});
