/** StudentManagePage（006 US2、FR-008～FR-011） */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type GroupOverview } from '../src/api/apiClient';
import { StudentManagePage } from '../src/pages/StudentManagePage';
import { mockMe, renderAt, teacherUser } from './utils';

const emptyOverview: GroupOverview = { groupCount: 0, groups: [], unassigned: [] };

beforeEach(() => mockMe(teacherUser));
afterEach(() => vi.restoreAllMocks());

const renderPage = () => renderAt('/teacher/students', <StudentManagePage />);

describe('StudentManagePage', () => {
  it('標題為「學生管理」，依序顯示學生帳號與組別管理兩個區塊（US2-1）', async () => {
    vi.spyOn(api, 'listStudents').mockResolvedValue({ students: [] });
    vi.spyOn(api, 'groupOverview').mockResolvedValue(emptyOverview);
    renderPage();
    expect(await screen.findByRole('heading', { name: '學生管理', level: 2 })).toBeInTheDocument();
    const sections = screen.getAllByRole('heading', { level: 3 }).map((h) => h.id);
    expect(sections.indexOf('student-create-title')).toBeLessThan(
      sections.indexOf('group-manage-title'),
    );
    expect(sections).toContain('student-create-title');
    expect(sections).toContain('group-manage-title');
  });

  it('建立學生後，組別管理不需重新整理就重新載入（US2-2、FR-009）', async () => {
    vi.spyOn(api, 'listStudents').mockResolvedValue({ students: [] });
    const overview = vi.spyOn(api, 'groupOverview').mockResolvedValue(emptyOverview);
    vi.spyOn(api, 'createStudent').mockResolvedValue({
      student: {
        studentId: 'B1103',
        name: '王小明',
        groupNumber: null,
        usingDefaultPassword: true,
      },
    });
    renderPage();
    await waitFor(() => expect(overview).toHaveBeenCalledTimes(1));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('學號'), 'b1103');
    await user.type(screen.getByLabelText('姓名'), '王小明');
    await user.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() => expect(overview).toHaveBeenCalledTimes(2));
  });

  it('變更組數後，學生清單重新載入（US2-3、FR-009）', async () => {
    const list = vi.spyOn(api, 'listStudents').mockResolvedValue({ students: [] });
    vi.spyOn(api, 'groupOverview').mockResolvedValue(emptyOverview);
    vi.spyOn(api, 'setGroupCount').mockResolvedValue({ groupCount: 2 });
    renderPage();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    const user = userEvent.setup();
    const input = await screen.findByLabelText('組數（0–50）');
    await user.clear(input);
    await user.type(input, '2');
    await user.click(screen.getByRole('button', { name: '更新組數' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('頁內不再有前往搶答活動、題目管理的按鈕（FR-011，邊界）', async () => {
    vi.spyOn(api, 'listStudents').mockResolvedValue({ students: [] });
    vi.spyOn(api, 'groupOverview').mockResolvedValue(emptyOverview);
    renderPage();
    await screen.findByRole('heading', { name: '學生管理', level: 2 });
    expect(screen.queryByRole('link', { name: '搶答活動' })).toBeNull();
    expect(screen.queryByRole('link', { name: '題目管理' })).toBeNull();
  });
});
