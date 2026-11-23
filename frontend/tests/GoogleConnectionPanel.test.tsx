import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { api } from '../src/api/apiClient';
import { GoogleConnectionPanel } from '../src/questions/GoogleConnectionPanel';

afterEach(() => vi.restoreAllMocks());

function SearchProbe() {
  return <div data-testid="search">{useLocation().search}</div>;
}

function renderPanel(path = '/teacher/questions', navigateExternal = vi.fn()) {
  const onStatus = vi.fn();
  render(
    <MemoryRouter initialEntries={[path]}>
      <GoogleConnectionPanel onStatus={onStatus} navigateExternal={navigateExternal} />
      <SearchProbe />
    </MemoryRouter>,
  );
  return { onStatus, navigateExternal };
}

describe('GoogleConnectionPanel（US1、FR-002）', () => {
  it('系統未設定串接：顯示提示且沒有連結按鈕', async () => {
    vi.spyOn(api, 'getGoogleStatus').mockResolvedValue({ configured: false, connected: false });
    renderPanel();
    expect(await screen.findByText('系統尚未設定 Google 試算表串接')).toBeInTheDocument();
    expect(screen.getByText('請聯絡系統管理者')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '連結 Google 帳號' })).toBeNull();
  });

  it('未連結：按「連結 Google 帳號」後前往 Google 授權頁（正常）', async () => {
    vi.spyOn(api, 'getGoogleStatus').mockResolvedValue({ configured: true, connected: false });
    const start = vi
      .spyOn(api, 'startGoogleAuth')
      .mockResolvedValue({ authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    const { onStatus, navigateExternal } = renderPanel();
    expect(await screen.findByText('請先連結 Google 帳號，才能讀取學習單')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '連結 Google 帳號' }));
    expect(start).toHaveBeenCalled();
    expect(navigateExternal).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?x=1',
    );
    expect(onStatus).toHaveBeenCalledWith({ configured: true, connected: false });
  });

  it('已連結：顯示 email；中斷連結需確認，取消時不呼叫 API', async () => {
    const status = vi
      .spyOn(api, 'getGoogleStatus')
      .mockResolvedValueOnce({ configured: true, connected: true, googleEmail: 't@example.edu' })
      .mockResolvedValueOnce({ configured: true, connected: false });
    const disconnect = vi.spyOn(api, 'disconnectGoogle').mockResolvedValue(undefined);
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderPanel();
    expect(await screen.findByText('已連結 Google 帳號：t@example.edu')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '中斷 Google 連結' }));
    expect(disconnect).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '中斷 Google 連結' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: '連結 Google 帳號' })).toBeInTheDocument();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['connected', '已完成 Google 帳號連結'],
    ['denied', '未完成 Google 帳號連結，請再試一次'],
    ['scope_missing', '需要同意存取 Google 試算表，才能匯入學習單'],
    ['state_invalid', '連結請求已失效，請重新按「連結 Google 帳號」'],
    ['error', '暫時無法完成 Google 帳號連結，請稍後再試'],
  ])('?google=%s 顯示結果訊息並移除查詢參數', async (result, text) => {
    vi.spyOn(api, 'getGoogleStatus').mockResolvedValue({
      configured: true,
      connected: result === 'connected',
      googleEmail: result === 'connected' ? 't@example.edu' : undefined,
    });
    renderPanel(`/teacher/questions?google=${result}`);
    expect(await screen.findByText(text)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(''));
  });

  it('未知的 ?google= 值不顯示訊息（邊界）', async () => {
    vi.spyOn(api, 'getGoogleStatus').mockResolvedValue({ configured: true, connected: false });
    renderPanel('/teacher/questions?google=<script>');
    await screen.findByRole('button', { name: '連結 Google 帳號' });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
