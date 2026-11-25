/** WritebackPreviewDialog（005 contracts/ui-routes.md；US1、US2、US4、US5；FR-027）。資料皆為虛構。 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WritebackItemView, WritebackOutcomeView, WritebackPreviewView } from '@buzzer/shared';
import { api, ApiError } from '../src/api/apiClient';
import { WritebackPreviewDialog } from '../src/activity/WritebackPreviewDialog';
import { mockMe, renderAt, teacherUser } from './utils';

function item(n: number, over: Partial<WritebackItemView> = {}): WritebackItemView {
  return {
    key: `qs0${n}:0`,
    questionNumber: String(n),
    partLabel: null,
    cell: `G${3 + n * 2}`,
    fallbackCell: `G${3 + n * 2}`,
    hidden: false,
    winnerTeamName: `第 ${n} 組`,
    answer: `答案 ${n}`,
    currentContent: '',
    status: 'EMPTY',
    ...over,
  };
}

function previewView(
  items: WritebackItemView[],
  over: Partial<WritebackPreviewView> = {},
): WritebackPreviewView {
  const count = (s: WritebackItemView['status']) => items.filter((i) => i.status === s).length;
  return {
    previewId: 'AbCdEfGhIjKl',
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    target: {
      spreadsheetTitle: '虛構學習單',
      sheetTitle: '學習單',
      url: 'https://docs.google.com/spreadsheets/d/x/edit',
    },
    items,
    skipped: [
      { questionNumber: '5', reason: 'NO_WINNER' },
      { questionNumber: '6', reason: 'NOT_OPENED' },
    ],
    summary: {
      emptyCount: count('EMPTY'),
      overwriteCount: count('OVERWRITE'),
      sameCount: count('SAME_CONTENT'),
      unresolvedCount: count('ANNOTATION_MISSING') + count('ANNOTATION_DUPLICATED'),
      skippedQuestionCount: 2,
    },
    ...over,
  };
}

const outcome = (over: Partial<WritebackOutcomeView> = {}): WritebackOutcomeView => ({
  writtenCells: 4,
  writtenQuestions: 4,
  overwrittenCells: 0,
  skippedCells: 0,
  skippedReasons: [],
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/x/edit',
  ...over,
});

beforeEach(() => mockMe(teacherUser));
afterEach(() => vi.restoreAllMocks());

function renderDialog() {
  const onClose = vi.fn();
  renderAt('/teacher/activity', <WritebackPreviewDialog onClose={onClose} />);
  return { onClose, user: userEvent.setup() };
}

describe('預覽與確認（US1）', () => {
  it('顯示載入中、目標、摘要、項目與不寫入題目；確認後顯示結果與試算表連結（US1-1、US1-2）', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(
      previewView([1, 2, 3, 4].map((n) => item(n))),
    );
    const confirm = vi.spyOn(api, 'writebackConfirm').mockResolvedValue(outcome());
    const { user, onClose } = renderDialog();
    expect(screen.getByText('正在讀取學習單…')).toBeInTheDocument();
    expect(await screen.findByText('虛構學習單／學習單')).toBeInTheDocument();
    expect(screen.getByTestId('writeback-summary')).toHaveTextContent(
      '4 格將寫入空白格、0 格將覆蓋既有內容、0 格已是相同內容、0 格無法定位',
    );
    const card = screen.getByRole('listitem', { name: '第 1 題' });
    expect(within(card).getByText('作答格 G5')).toBeInTheDocument();
    expect(within(card).getByText('答案 1')).toBeInTheDocument();
    expect(screen.getByText('第 5 題：無組別送出，不寫入')).toBeInTheDocument();
    expect(screen.getByText('第 6 題：未開放，不寫入')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '確認寫回' }));
    expect(confirm).toHaveBeenCalledWith({ previewId: 'AbCdEfGhIjKl' });
    expect(await screen.findByText('已寫回 4 格（4 題）')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '開啟試算表' })).toHaveAttribute('target', '_blank');
    await user.click(screen.getByRole('button', { name: '關閉' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('答案與組名以純文字呈現並保留換行（FR-027）', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(
      previewView([item(1, { answer: '<b>粗體</b>\n第二行', winnerTeamName: '<img src=x>' })]),
    );
    renderDialog();
    const answer = await screen.findByText(/<b>粗體<\/b>/);
    expect(answer.className).toContain('whitespace-pre-wrap');
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x>')).toBeInTheDocument();
  });

  it('取消時不呼叫確認（US2-6）', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(previewView([item(1)]));
    const confirm = vi.spyOn(api, 'writebackConfirm');
    const { user, onClose } = renderDialog();
    await user.click(await screen.findByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('寫回中按鈕停用且不可關閉', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(previewView([item(1)]));
    let resolve!: (v: WritebackOutcomeView) => void;
    vi.spyOn(api, 'writebackConfirm').mockReturnValue(new Promise((r) => (resolve = r)));
    const { user } = renderDialog();
    await user.click(await screen.findByRole('button', { name: '確認寫回' }));
    expect(screen.getByRole('button', { name: '寫回中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    resolve(outcome({ writtenCells: 1, writtenQuestions: 1 }));
    expect(await screen.findByText('已寫回 1 格（1 題）')).toBeInTheDocument();
  });
});

describe('覆蓋確認（US2）', () => {
  const items = () => [
    item(1, { status: 'OVERWRITE', currentContent: '老師筆記' }),
    item(2, { status: 'SAME_CONTENT', currentContent: '答案 2' }),
    item(3),
  ];

  it('有將覆蓋的格子時必須先選覆蓋選項，選擇後送出 mode（US2-1、US2-3）', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(previewView(items()));
    const confirm = vi
      .spyOn(api, 'writebackConfirm')
      .mockResolvedValue(
        outcome({
          writtenCells: 1,
          writtenQuestions: 1,
          skippedCells: 1,
          skippedReasons: [{ reason: 'NON_EMPTY', count: 1 }],
        }),
      );
    const { user } = renderDialog();
    const card = await screen.findByRole('listitem', { name: '第 1 題' });
    expect(within(card).getByText('已有內容，將覆蓋')).toBeInTheDocument();
    expect(within(card).getByText('老師筆記')).toBeInTheDocument();
    expect(card.className).toContain('border-accent');
    expect(screen.getByText('已是相同內容，不需寫入')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: '確認寫回' });
    expect(confirmBtn).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: '略過已有內容的格子，只寫入空白格' }));
    expect(confirmBtn).toBeEnabled();
    await user.click(confirmBtn);
    expect(confirm).toHaveBeenCalledWith({ previewId: 'AbCdEfGhIjKl', mode: 'SKIP_NON_EMPTY' });
    expect(
      await screen.findByText('已寫回 1 格（1 題）；略過 1 格（已有內容 1）'),
    ).toBeInTheDocument();
  });

  it('全部覆蓋的結果顯示覆蓋格數（US2-2）', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(previewView(items()));
    vi.spyOn(api, 'writebackConfirm').mockResolvedValue(
      outcome({ writtenCells: 2, writtenQuestions: 2, overwrittenCells: 1 }),
    );
    const { user } = renderDialog();
    await user.click(await screen.findByRole('radio', { name: '全部覆蓋' }));
    await user.click(screen.getByRole('button', { name: '確認寫回' }));
    expect(
      await screen.findByText('已寫回 2 格（2 題），其中 1 格覆蓋既有內容'),
    ).toBeInTheDocument();
  });

  it('預覽後有變動 → 顯示變動題號與「重新預覽」，重新預覽會再讀取（US2-5）', async () => {
    const previewSpy = vi.spyOn(api, 'writebackPreview').mockResolvedValue(previewView([item(1)]));
    vi.spyOn(api, 'writebackConfirm').mockRejectedValue(
      new ApiError(
        409,
        'WRITEBACK_STALE',
        '學習單在預覽後有變動（第 3 題作答格），請重新預覽',
        undefined,
        '請重新預覽',
      ),
    );
    const { user } = renderDialog();
    await user.click(await screen.findByRole('button', { name: '確認寫回' }));
    expect(
      await screen.findByText('學習單在預覽後有變動（第 3 題作答格），請重新預覽'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新預覽' }));
    await waitFor(() => expect(previewSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: '確認寫回' })).toBeInTheDocument();
  });

  it('預覽已失效 → 顯示「重新預覽」', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(previewView([item(1)]));
    vi.spyOn(api, 'writebackConfirm').mockRejectedValue(
      new ApiError(410, 'WRITEBACK_PREVIEW_EXPIRED', '預覽已失效', undefined, '請重新預覽'),
    );
    const { user } = renderDialog();
    await user.click(await screen.findByRole('button', { name: '確認寫回' }));
    expect(await screen.findByText('預覽已失效')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新預覽' })).toBeInTheDocument();
  });
});

describe('錯誤處理（US4）', () => {
  it.each(['GOOGLE_NOT_CONNECTED', 'GOOGLE_AUTH_EXPIRED'])(
    '%s → 顯示訊息與「前往連結 Google 帳號」（US4-4）',
    async (code) => {
      vi.spyOn(api, 'writebackPreview').mockRejectedValue(
        new ApiError(
          409,
          code,
          '請先連結 Google 帳號',
          undefined,
          '請到「題目管理」按「連結 Google 帳號」',
        ),
      );
      renderDialog();
      expect(await screen.findByText('請先連結 Google 帳號')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '前往連結 Google 帳號' })).toHaveAttribute(
        'href',
        '/teacher/questions',
      );
    },
  );

  it('確認時 Google 錯誤 → 保留預覽可重試，提示試算表未被修改（US4-7）', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(previewView([item(1)]));
    const confirm = vi
      .spyOn(api, 'writebackConfirm')
      .mockRejectedValueOnce(
        new ApiError(503, 'GOOGLE_UNAVAILABLE', '暫時無法連線到 Google 試算表，請稍後再試'),
      )
      .mockResolvedValueOnce(outcome({ writtenCells: 1, writtenQuestions: 1 }));
    const { user } = renderDialog();
    await user.click(await screen.findByRole('button', { name: '確認寫回' }));
    expect(await screen.findByText('暫時無法連線到 Google 試算表，請稍後再試')).toBeInTheDocument();
    expect(screen.getByText('試算表未被修改')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '確認寫回' }));
    expect(await screen.findByText('已寫回 1 格（1 題）')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('作答中的題目列在不寫入清單（US4-1）', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(
      previewView([item(1)], { skipped: [{ questionNumber: '3', reason: 'ANSWERING' }] }),
    );
    renderDialog();
    expect(await screen.findByText('第 3 題：作答中，結束後才可寫回')).toBeInTheDocument();
  });
});

describe('找不到標註（US5）', () => {
  it('找不到標註的項目預設不勾，勾選後送出 fallbackKeys（US5-1、US5-2）', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(
      previewView([
        item(1),
        item(3, {
          cell: null,
          fallbackCell: 'G9',
          status: 'ANNOTATION_MISSING',
          currentContent: '',
        }),
      ]),
    );
    const confirm = vi.spyOn(api, 'writebackConfirm').mockResolvedValue(outcome());
    const { user } = renderDialog();
    const card = await screen.findByRole('listitem', { name: '第 3 題' });
    expect(
      within(card).getByText(/找不到作答格標註（匯入時位置：G9，目前內容：/),
    ).toBeInTheDocument();
    const box = within(card).getByRole('checkbox', { name: '寫入匯入時的位置' });
    expect(box).not.toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole('button', { name: '確認寫回' }));
    expect(confirm).toHaveBeenCalledWith({ previewId: 'AbCdEfGhIjKl', fallbackKeys: ['qs03:0'] });
  });

  it('勾選的後備格已有內容時需要覆蓋選項', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(
      previewView([
        item(3, { cell: null, status: 'ANNOTATION_MISSING', currentContent: '舊內容' }),
      ]),
    );
    const { user } = renderDialog();
    await user.click(await screen.findByRole('checkbox', { name: '寫入匯入時的位置' }));
    expect(screen.getByRole('button', { name: '確認寫回' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '全部覆蓋' })).toBeInTheDocument();
  });

  it('標註重複的項目說明將略過（US5-3）', async () => {
    vi.spyOn(api, 'writebackPreview').mockResolvedValue(
      previewView([item(1), item(2, { cell: null, status: 'ANNOTATION_DUPLICATED' })]),
    );
    renderDialog();
    expect(
      await screen.findByText('作答格標註重複，無法判斷位置，將略過；請重新匯入學習單修正標註'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('全部找不到標註 → 顯示本場學習單名稱與連結（US5-4）', async () => {
    vi.spyOn(api, 'writebackPreview').mockRejectedValue(
      new ApiError(
        409,
        'WRITEBACK_NOT_THIS_SHEET',
        '這份學習單上找不到本場活動的作答格標註',
        undefined,
        '請確認',
        {
          spreadsheetTitle: '虛構學習單',
          url: 'https://docs.google.com/spreadsheets/d/x/edit',
        },
      ),
    );
    renderDialog();
    expect(await screen.findByText('這份學習單上找不到本場活動的作答格標註')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '本場活動的學習單：虛構學習單' })).toHaveAttribute(
      'href',
      'https://docs.google.com/spreadsheets/d/x/edit',
    );
  });
});
