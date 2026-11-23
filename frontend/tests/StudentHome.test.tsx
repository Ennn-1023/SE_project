import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/apiClient';
import { StudentHome } from '../src/pages/StudentHome';
import { mockMe, renderAt, studentUser } from './utils';

afterEach(() => vi.restoreAllMocks());

function renderHome() {
  mockMe(studentUser);
  return renderAt('/student', <StudentHome />);
}

describe('StudentHome（US3、FR-039）', () => {
  it('groupCount = 0 顯示「老師尚未開放分組」且沒有選組按鈕（邊界）', async () => {
    vi.spyOn(api, 'myGroup').mockResolvedValue({ groupNumber: null, groupCount: 0 });
    renderHome();
    expect(await screen.findByText('老師尚未開放分組')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /第 \d+ 組/ })).not.toBeInTheDocument();
  });

  it('未分配顯示「尚未分組」與 1..N 按鈕，點擊後顯示「你在第 g 組」且按鈕消失（正常）', async () => {
    vi.spyOn(api, 'myGroup').mockResolvedValue({ groupNumber: null, groupCount: 4 });
    const select = vi
      .spyOn(api, 'selectGroup')
      .mockResolvedValue({ groupNumber: 3, groupCount: 4 });
    renderHome();
    expect(await screen.findByText('尚未分組')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /^第 \d+ 組$/ });
    expect(buttons.map((b) => b.textContent)).toEqual(['第 1 組', '第 2 組', '第 3 組', '第 4 組']);
    await userEvent.setup().click(screen.getByRole('button', { name: '第 3 組' }));
    expect(select).toHaveBeenCalledWith(3);
    expect(await screen.findByText('你在第 3 組')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^第 \d+ 組$/ })).not.toBeInTheDocument();
  });

  it('已分組顯示「你在第 g 組」，無選組按鈕', async () => {
    vi.spyOn(api, 'myGroup').mockResolvedValue({ groupNumber: 2, groupCount: 4 });
    renderHome();
    expect(await screen.findByText('你在第 2 組')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^第 \d+ 組$/ })).not.toBeInTheDocument();
  });

  it('收到 409 ALREADY_ASSIGNED 時顯示訊息並更新為伺服器回傳的組別', async () => {
    vi.spyOn(api, 'myGroup').mockResolvedValue({ groupNumber: null, groupCount: 4 });
    vi.spyOn(api, 'selectGroup').mockRejectedValue(
      new ApiError(409, 'ALREADY_ASSIGNED', '你已分組，如需更換請洽老師', undefined, undefined, {
        currentGroupNumber: 2,
      }),
    );
    renderHome();
    await userEvent.setup().click(await screen.findByRole('button', { name: '第 3 組' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('你已分組，如需更換請洽老師');
    expect(screen.getByText('你在第 2 組')).toBeInTheDocument();
  });

  it('收到 400 時依伺服器最新組數重新顯示按鈕', async () => {
    vi.spyOn(api, 'myGroup').mockResolvedValue({ groupNumber: null, groupCount: 4 });
    vi.spyOn(api, 'selectGroup').mockRejectedValue(
      new ApiError(
        400,
        'VALIDATION_ERROR',
        '可選範圍為 1–2',
        'groupNumber',
        '請選擇 1–2 之間的組別',
        {
          groupCount: 2,
        },
      ),
    );
    renderHome();
    await userEvent.setup().click(await screen.findByRole('button', { name: '第 4 組' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('可選範圍為 1–2');
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^第 \d+ 組$/ })).toHaveLength(2),
    );
  });

  it('收到 409 GROUPS_NOT_OPEN 時改顯示「老師尚未開放分組」', async () => {
    vi.spyOn(api, 'myGroup').mockResolvedValue({ groupNumber: null, groupCount: 3 });
    vi.spyOn(api, 'selectGroup').mockRejectedValue(
      new ApiError(409, 'GROUPS_NOT_OPEN', '老師尚未開放分組'),
    );
    renderHome();
    await userEvent.setup().click(await screen.findByRole('button', { name: '第 1 組' }));
    expect(await screen.findAllByText('老師尚未開放分組')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^第 \d+ 組$/ })).not.toBeInTheDocument();
  });
});
