/** US3：匯入預覽與確認（FR-026、FR-027、FR-030）。 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/apiClient';
import { ImportPreview } from '../src/questions/ImportPreview';
import { questionSetView } from './questionFixtures';

afterEach(() => vi.restoreAllMocks());

const DRAFT = '11111111-1111-4111-8111-111111111111';

function renderPreview(over: Partial<Parameters<typeof ImportPreview>[0]> = {}) {
  const props = {
    draftId: DRAFT,
    preview: questionSetView({
      warnings: [
        {
          code: 'ANSWER_HAS_CONTENT' as const,
          message: '第 2 題的作答格 G13 已有內容',
          hint: '系統不會保存',
        },
      ],
    }),
    replaces: null,
    onBack: vi.fn(),
    onImported: vi.fn(),
    ...over,
  };
  render(<ImportPreview {...props} />);
  return props;
}

describe('ImportPreview', () => {
  it('顯示題號、題目、共同題幹、作答格位置、題數與提醒（正常）', () => {
    renderPreview();
    expect(screen.getByText('共 2 題、3 個作答格')).toBeInTheDocument();
    const q1 = screen.getByRole('listitem', { name: '第 1 題' });
    expect(within(q1).getByText(/閱讀下列文章/)).toBeInTheDocument();
    expect(within(q1).getByText(/學習單!A2/)).toBeInTheDocument();
    expect(within(q1).getByText('（1）')).toBeInTheDocument();
    expect(within(q1).getByText(/學習單!H6/)).toBeInTheDocument();
    const q2 = screen.getByRole('listitem', { name: '第 2 題' });
    expect(within(q2).getByText(/作答格已有內容/)).toBeInTheDocument();
    expect(screen.getByText(/第 2 題的作答格 G13 已有內容/)).toBeInTheDocument();
  });

  it('已有題目集時提示將被取代', () => {
    renderPreview({
      replaces: { spreadsheetTitle: '舊學習單', sheetTitle: '學習單', questionCount: 6 },
    });
    expect(
      screen.getByText('確認匯入後將取代目前的題目集（舊學習單／學習單，6 題）'),
    ).toBeInTheDocument();
  });

  it('確認匯入成功後通知父元件；連按兩次只送出一次（FR-030）', async () => {
    let resolve!: (v: { questionSet: ReturnType<typeof questionSetView> }) => void;
    const confirm = vi
      .spyOn(api, 'confirmImport')
      .mockReturnValue(new Promise((r) => (resolve = r)));
    const props = renderPreview();
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: '確認匯入' });
    await user.click(button);
    await user.click(button);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(DRAFT);
    resolve({ questionSet: questionSetView({ importedAt: new Date().toISOString() }) });
    await waitFor(() => expect(props.onImported).toHaveBeenCalledTimes(1));
  });

  it('學習單在標註期間被修改 → 顯示 SHEET_CHANGED 訊息（邊界）', async () => {
    vi.spyOn(api, 'confirmImport').mockRejectedValue(
      new ApiError(
        409,
        'SHEET_CHANGED',
        '學習單在標註期間被修改',
        undefined,
        '請重新讀取並確認標註',
      ),
    );
    const props = renderPreview();
    await userEvent.setup().click(screen.getByRole('button', { name: '確認匯入' }));
    expect(await screen.findByText('學習單在標註期間被修改')).toBeInTheDocument();
    expect(screen.getByText('請重新讀取並確認標註')).toBeInTheDocument();
    expect(props.onImported).not.toHaveBeenCalled();
  });

  it('「返回修改」回到標註', async () => {
    const props = renderPreview();
    await userEvent.setup().click(screen.getByRole('button', { name: '返回修改' }));
    expect(props.onBack).toHaveBeenCalled();
  });
});
