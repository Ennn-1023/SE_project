import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type StudentListItem } from '../src/api/apiClient';
import { StudentCreatePanel } from '../src/pages/StudentCreatePanel';

afterEach(() => vi.restoreAllMocks());

const s = (
  studentId: string,
  name: string,
  groupNumber: number | null = null,
): StudentListItem => ({
  studentId,
  name,
  groupNumber,
  usingDefaultPassword: true,
});

async function submit(studentId: string, name: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('學號'), studentId);
  if (name) await user.type(screen.getByLabelText('姓名'), name);
  await user.click(screen.getByRole('button', { name: '建立' }));
}

describe('StudentCreatePanel（US1）', () => {
  it('建立成功顯示「已建立 學號 姓名」並刷新清單（正常）', async () => {
    const list = vi
      .spyOn(api, 'listStudents')
      .mockResolvedValueOnce({ students: [s('A0001', '甲', 2)] })
      .mockResolvedValueOnce({ students: [s('A0001', '甲', 2), s('B1103', '王小明')] });
    vi.spyOn(api, 'createStudent').mockResolvedValue({ student: s('B1103', '王小明') });
    render(<StudentCreatePanel />);
    expect(await screen.findByText('甲')).toBeInTheDocument();
    expect(screen.getByText('第 2 組')).toBeInTheDocument();

    await submit('b1103', '王小明');
    expect(await screen.findByRole('status')).toHaveTextContent('已建立 B1103 王小明');
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('王小明')).toBeInTheDocument();
    expect(screen.getAllByText('未分配').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('學號')).toHaveValue('');
  });

  it('409 顯示 ErrorMessage（學號已存在）', async () => {
    vi.spyOn(api, 'listStudents').mockResolvedValue({ students: [] });
    vi.spyOn(api, 'createStudent').mockRejectedValue(
      new ApiError(409, 'STUDENT_EXISTS', '學號 B1103 已存在', 'studentId', '學號不分大小寫'),
    );
    render(<StudentCreatePanel />);
    await submit('b1103', '乙');
    expect(await screen.findByRole('alert')).toHaveTextContent('學號 B1103 已存在');
    expect(screen.getByLabelText('學號')).toHaveAttribute('aria-invalid', 'true');
  });

  it('400 顯示欄位錯誤與修正提示（邊界）', async () => {
    vi.spyOn(api, 'listStudents').mockResolvedValue({ students: [] });
    vi.spyOn(api, 'createStudent').mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', '請輸入姓名', 'name', '姓名須為 1–50 個字元'),
    );
    render(<StudentCreatePanel />);
    await submit('B1103', '');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('請輸入姓名');
    expect(alert).toHaveTextContent('姓名須為 1–50 個字元');
    expect(screen.getByLabelText('姓名')).toHaveAttribute('aria-invalid', 'true');
  });

  it('建立中停用按鈕，避免重複送出', async () => {
    vi.spyOn(api, 'listStudents').mockResolvedValue({ students: [] });
    let resolve!: (v: { student: StudentListItem }) => void;
    const create = vi
      .spyOn(api, 'createStudent')
      .mockImplementation(() => new Promise((r) => (resolve = r)));
    render(<StudentCreatePanel />);
    await submit('B1103', '甲');
    expect(screen.getByRole('button', { name: '建立中…' })).toBeDisabled();
    resolve({ student: s('B1103', '甲') });
    await screen.findByRole('status');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('StudentCreatePanel 重設密碼（US5、FR-025）', () => {
  it('確認後呼叫重設 API、顯示結果並刷新清單', async () => {
    const list = vi
      .spyOn(api, 'listStudents')
      .mockResolvedValue({ students: [{ ...s('B1103', '王小明'), usingDefaultPassword: false }] });
    const reset = vi.spyOn(api, 'resetPassword').mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<StudentCreatePanel />);
    await userEvent.setup().click(await screen.findByRole('button', { name: '重設 B1103 的密碼' }));
    expect(confirm).toHaveBeenCalled();
    expect(reset).toHaveBeenCalledWith('B1103');
    expect(await screen.findByRole('status')).toHaveTextContent(
      '已將 B1103 王小明 的密碼重設為預設密碼',
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('取消確認時不呼叫 API', async () => {
    vi.spyOn(api, 'listStudents').mockResolvedValue({ students: [s('B1103', '王小明')] });
    const reset = vi.spyOn(api, 'resetPassword');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<StudentCreatePanel />);
    await userEvent.setup().click(await screen.findByRole('button', { name: '重設 B1103 的密碼' }));
    expect(reset).not.toHaveBeenCalled();
  });
});
