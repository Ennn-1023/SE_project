import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type GroupOverview } from '../src/api/apiClient';
import { GroupManagePanel } from '../src/pages/GroupManagePanel';

afterEach(() => vi.restoreAllMocks());

const overview = (
  groupCount: number,
  assigned: Record<number, [string, string][]>,
  unassigned: [string, string][],
): GroupOverview => ({
  groupCount,
  groups: Array.from({ length: groupCount }, (_, i) => {
    const members = (assigned[i + 1] ?? []).map(([studentId, name]) => ({ studentId, name }));
    return { groupNumber: i + 1, members, memberCount: members.length };
  }),
  unassigned: unassigned.map(([studentId, name]) => ({ studentId, name })),
});

describe('GroupManagePanel（US4）', () => {
  it('設定組數後總覽重新整理（正常）', async () => {
    const ov = vi
      .spyOn(api, 'groupOverview')
      .mockResolvedValueOnce(overview(0, {}, [['S0001', '甲']]))
      .mockResolvedValueOnce(overview(3, {}, [['S0001', '甲']]));
    const set = vi.spyOn(api, 'setGroupCount').mockResolvedValue({ groupCount: 3 });
    render(<GroupManagePanel />);
    expect(await screen.findByText('尚未設定組別')).toBeInTheDocument();
    const user = userEvent.setup();
    const input = screen.getByLabelText('組數（0–50）');
    await user.clear(input);
    await user.type(input, '3');
    await user.click(screen.getByRole('button', { name: '更新組數' }));
    expect(set).toHaveBeenCalledWith(3);
    expect(await screen.findByRole('heading', { name: '第 3 組（0 人）' })).toBeInTheDocument();
    expect(ov).toHaveBeenCalledTimes(2);
  });

  it('組數輸入非整數時顯示欄位錯誤且不送出（邊界）', async () => {
    vi.spyOn(api, 'groupOverview').mockResolvedValue(overview(2, {}, []));
    const set = vi.spyOn(api, 'setGroupCount');
    render(<GroupManagePanel />);
    const user = userEvent.setup();
    const input = await screen.findByLabelText('組數（0–50）');
    await user.clear(input);
    await user.type(input, '2.5');
    await user.click(screen.getByRole('button', { name: '更新組數' }));
    expect(await screen.findByText('組數必須是 0–50 的整數')).toBeInTheDocument();
    expect(set).not.toHaveBeenCalled();
  });

  it('409 顯示阻擋的組別與成員', async () => {
    vi.spyOn(api, 'groupOverview').mockResolvedValue(overview(4, { 4: [['S0001', '甲']] }, []));
    vi.spyOn(api, 'setGroupCount').mockRejectedValue(
      new ApiError(
        409,
        'GROUP_NOT_EMPTY',
        '第 4 組仍有成員，無法將組數調降為 3',
        'groupCount',
        '請先將這些學生移到其他組或改回未分配',
        {
          blockingGroups: [{ groupNumber: 4, members: [{ studentId: 'S0001', name: '甲' }] }],
        },
      ),
    );
    render(<GroupManagePanel />);
    const user = userEvent.setup();
    const input = await screen.findByLabelText('組數（0–50）');
    await user.clear(input);
    await user.type(input, '3');
    await user.click(screen.getByRole('button', { name: '更新組數' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('第 4 組仍有成員，無法將組數調降為 3');
    expect(alert).toHaveTextContent('第 4 組：S0001 甲');
  });

  it('變更學生組別（含「未分配」選項）後總覽更新', async () => {
    vi.spyOn(api, 'groupOverview')
      .mockResolvedValueOnce(overview(2, { 1: [['S0001', '甲']] }, [['S0002', '乙']]))
      .mockResolvedValueOnce(overview(2, { 2: [['S0001', '甲']] }, [['S0002', '乙']]))
      .mockResolvedValueOnce(
        overview(2, {}, [
          ['S0001', '甲'],
          ['S0002', '乙'],
        ]),
      );
    const assign = vi.spyOn(api, 'assignGroup').mockResolvedValue({
      student: { studentId: 'S0001', name: '甲', groupNumber: 2, usingDefaultPassword: true },
    });
    render(<GroupManagePanel />);
    const user = userEvent.setup();
    const select = await screen.findByLabelText('S0001 甲 的組別');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['未分配', '第 1 組', '第 2 組']);
    await user.selectOptions(select, '2');
    expect(assign).toHaveBeenCalledWith('S0001', 2);
    expect(await screen.findByRole('heading', { name: '第 2 組（1 人）' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('S0001 甲 的組別'), '');
    expect(assign).toHaveBeenLastCalledWith('S0001', null);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '未分組（2 人）' })).toBeInTheDocument(),
    );
  });
});
