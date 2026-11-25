/** ExportCsvButton 與 downloadResultsCsv（005 US3、research R11）。 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, downloadResultsCsv, filenameFromDisposition } from '../src/api/apiClient';
import { ExportCsvButton } from '../src/activity/ExportCsvButton';

afterEach(() => vi.restoreAllMocks());

describe('ExportCsvButton', () => {
  it('按下後顯示「匯出中…」並停用，完成後恢復（正常）', async () => {
    let resolve!: (v: string) => void;
    const spy = vi
      .spyOn(api, 'downloadResultsCsv')
      .mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ExportCsvButton />);
    await userEvent.setup().click(screen.getByRole('button', { name: '匯出結果 CSV' }));
    expect(spy).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '匯出中…' })).toBeDisabled();
    resolve('搶答結果_20261124-0930.csv');
    expect(await screen.findByRole('button', { name: '匯出結果 CSV' })).toBeEnabled();
  });

  it('失敗時以 role="alert" 顯示原因與修正方式', async () => {
    vi.spyOn(api, 'downloadResultsCsv').mockRejectedValue(
      new ApiError(
        404,
        'NO_ACTIVITY_RESULTS',
        '尚無搶答活動結果可寫回或匯出',
        undefined,
        '請先開始活動並完成至少一題',
      ),
    );
    render(<ExportCsvButton />);
    await userEvent.setup().click(screen.getByRole('button', { name: '匯出結果 CSV' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('尚無搶答活動結果可寫回或匯出');
    expect(alert).toHaveTextContent('請先開始活動並完成至少一題');
  });

  it('disabled 時不可按（邊界）', () => {
    render(<ExportCsvButton disabled />);
    expect(screen.getByRole('button', { name: '匯出結果 CSV' })).toBeDisabled();
  });
});

describe('downloadResultsCsv', () => {
  it('成功時建立 Blob 並以 <a download> 觸發下載，使用伺服器的中文檔名', async () => {
    const create = vi.fn(() => 'blob:fake');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const fetchImpl = vi.fn(
      async () =>
        new Response('﻿題號\r\n', {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="activity-results.csv"; filename*=UTF-8''${encodeURIComponent('搶答結果_20261124-0930.csv')}`,
          },
        }),
    );
    await expect(downloadResultsCsv(fetchImpl)).resolves.toBe('搶答結果_20261124-0930.csv');
    expect(fetchImpl).toHaveBeenCalledWith('/api/teacher/activity/export.csv', {
      credentials: 'same-origin',
    });
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    vi.unstubAllGlobals();
  });

  it('失敗時解析錯誤格式丟出 ApiError，不觸發下載', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { code: 'FORBIDDEN', message: '權限不足', hint: '此功能僅限老師使用' } },
        { status: 403 },
      ),
    );
    await expect(downloadResultsCsv(fetchImpl)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: '權限不足',
    });
    expect(click).not.toHaveBeenCalled();
  });

  it('網路錯誤 → NETWORK_ERROR', async () => {
    await expect(
      downloadResultsCsv(async () => {
        throw new TypeError('fetch failed');
      }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it.each([
    [`attachment; filename="activity-results.csv"; filename*=UTF-8''%E6%90%B6.csv`, '搶.csv'],
    ['attachment; filename="activity-results.csv"', 'activity-results.csv'],
    [null, 'activity-results.csv'],
    [`attachment; filename*=UTF-8''%E0%A4%A`, 'activity-results.csv'],
  ])('filenameFromDisposition(%j) → %s（邊界）', (header, expected) => {
    expect(filenameFromDisposition(header)).toBe(expected);
  });
});
