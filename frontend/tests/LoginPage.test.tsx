import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/apiClient';
import { LoginPage } from '../src/pages/LoginPage';
import { mockMe, renderAt, studentUser, teacherUser } from './utils';

afterEach(() => vi.restoreAllMocks());

async function fillAndSubmit(account: string, password: string) {
  const user = userEvent.setup();
  if (account) await user.type(screen.getByLabelText('學號／帳號'), account);
  if (password) await user.type(screen.getByLabelText('密碼'), password);
  await user.click(screen.getByRole('button', { name: '登入' }));
}

describe('LoginPage（US1）', () => {
  it('老師登入成功後導向 /teacher（正常）', async () => {
    mockMe(null);
    const login = vi.spyOn(api, 'login').mockResolvedValue({ user: teacherUser });
    renderAt('/login', <LoginPage />);
    await fillAndSubmit('teacher', 'pw-123456');
    expect(login).toHaveBeenCalledWith('teacher', 'pw-123456');
    expect(await screen.findByTestId('location')).toHaveTextContent('/teacher');
  });

  it('學生登入成功後導向 /student（正常）', async () => {
    mockMe(null);
    vi.spyOn(api, 'login').mockResolvedValue({ user: studentUser });
    renderAt('/login', <LoginPage />);
    await fillAndSubmit('b1103', 'pw');
    expect(await screen.findByTestId('location')).toHaveTextContent('/student');
  });

  it('空欄位顯示欄位錯誤且不送出（邊界）', async () => {
    mockMe(null);
    const login = vi.spyOn(api, 'login');
    renderAt('/login', <LoginPage />);
    await fillAndSubmit('', '');
    expect(await screen.findByText('請輸入學號或帳號')).toBeInTheDocument();
    expect(screen.getByText('請輸入密碼')).toBeInTheDocument();
    expect(screen.getByLabelText('學號／帳號')).toHaveAttribute('aria-invalid', 'true');
    expect(login).not.toHaveBeenCalled();
  });

  it('401 顯示伺服器訊息，且停留在登入頁', async () => {
    mockMe(null);
    vi.spyOn(api, 'login').mockRejectedValue(
      new ApiError(
        401,
        'INVALID_CREDENTIALS',
        '帳號或密碼錯誤',
        undefined,
        '請確認學號（帳號）與密碼後再試一次',
      ),
    );
    renderAt('/login', <LoginPage />);
    await fillAndSubmit('b1103', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('帳號或密碼錯誤');
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });

  it('423 顯示鎖定訊息', async () => {
    mockMe(null);
    vi.spyOn(api, 'login').mockRejectedValue(
      new ApiError(
        423,
        'ACCOUNT_LOCKED',
        '嘗試次數過多，請 12 分鐘後再試',
        undefined,
        '如忘記密碼，請洽老師重設',
      ),
    );
    renderAt('/login', <LoginPage />);
    await fillAndSubmit('b1103', 'wrong');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('嘗試次數過多，請 12 分鐘後再試');
    expect(alert).toHaveTextContent('如忘記密碼，請洽老師重設');
  });

  it('已登入者造訪 /login 會自動導向', async () => {
    mockMe(studentUser);
    renderAt('/login', <LoginPage />);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/student'));
  });
});
