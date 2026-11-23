import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/apiClient';
import { ChangePasswordForm } from '../src/pages/ChangePasswordForm';
import { mockMe, renderAt, studentUser } from './utils';

afterEach(() => vi.restoreAllMocks());

async function fill(current: string, next: string, confirm: string) {
  const user = userEvent.setup();
  if (current) await user.type(screen.getByLabelText('目前密碼'), current);
  if (next) await user.type(screen.getByLabelText('新密碼'), next);
  if (confirm) await user.type(screen.getByLabelText('再次輸入新密碼'), confirm);
  await user.click(screen.getByRole('button', { name: '更新密碼' }));
}

function renderForm() {
  mockMe(studentUser);
  return renderAt('/account/password', <ChangePasswordForm />);
}

describe('ChangePasswordForm（US5）', () => {
  it('成功顯示完成訊息並清空欄位（正常）', async () => {
    const change = vi.spyOn(api, 'changePassword').mockResolvedValue(undefined);
    renderForm();
    await fill('old-password', 'new-password-1', 'new-password-1');
    expect(change).toHaveBeenCalledWith('old-password', 'new-password-1', 'new-password-1');
    expect(await screen.findByRole('status')).toHaveTextContent('密碼已更新');
    expect(screen.getByLabelText('新密碼')).toHaveValue('');
  });

  it('兩次輸入不一致時顯示欄位錯誤且不送出（邊界）', async () => {
    const change = vi.spyOn(api, 'changePassword');
    renderForm();
    await fill('old-password', 'new-password-1', 'new-password-2');
    expect(await screen.findByText('兩次輸入的新密碼不一致')).toBeInTheDocument();
    expect(screen.getByLabelText('再次輸入新密碼')).toHaveAttribute('aria-invalid', 'true');
    expect(change).not.toHaveBeenCalled();
  });

  it('新密碼少於 8 字元時顯示欄位錯誤且不送出（邊界）', async () => {
    const change = vi.spyOn(api, 'changePassword');
    renderForm();
    await fill('old-password', 'short', 'short');
    expect(await screen.findByText('新密碼至少 8 個字元')).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it('伺服器錯誤（目前密碼錯誤）顯示於對應欄位的 ErrorMessage', async () => {
    vi.spyOn(api, 'changePassword').mockRejectedValue(
      new ApiError(
        400,
        'INVALID_CURRENT_PASSWORD',
        '目前密碼不正確',
        'currentPassword',
        '請重新輸入目前使用中的密碼',
      ),
    );
    renderForm();
    await fill('wrong-current', 'new-password-1', 'new-password-1');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('目前密碼不正確');
    expect(alert).toHaveTextContent('請重新輸入目前使用中的密碼');
    expect(screen.getByLabelText('目前密碼')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });

  it('沒有欄位的伺服器錯誤以一般 ErrorMessage 顯示', async () => {
    vi.spyOn(api, 'changePassword').mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', '系統發生錯誤，請稍後再試'),
    );
    renderForm();
    await fill('old-password', 'new-password-1', 'new-password-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('系統發生錯誤，請稍後再試');
  });
});
