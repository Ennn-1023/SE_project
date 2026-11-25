/** TeacherLayout（006 US1、FR-002、FR-005；data-model §2 menuOpen） */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/auth/AuthContext';
import { TeacherLayout } from '../src/components/TeacherLayout';
import { LocationProbe, mockMe, teacherUser } from './utils';

beforeEach(() => mockMe(teacherUser));
afterEach(() => vi.restoreAllMocks());

function Page({ title }: { title: string }) {
  return (
    <TeacherLayout title={title}>
      <LocationProbe />
    </TeacherLayout>
  );
}

function renderLayout(path = '/teacher') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/teacher" element={<Page title="搶答活動" />} />
          <Route path="/teacher/questions" element={<Page title="題目管理" />} />
          <Route path="/teacher/students" element={<Page title="學生管理" />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const menuButton = () => screen.findByRole('button', { name: /選單$/ });

describe('TeacherLayout', () => {
  it('三條線按鈕的名稱與 aria-expanded 跟著選單開關變化（正常）', async () => {
    renderLayout();
    const user = userEvent.setup();
    const btn = await menuButton();
    expect(btn).toHaveAccessibleName('開啟選單');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn.className).toContain('min-h-11');
    await user.click(btn);
    expect(screen.getByRole('dialog', { name: '老師功能選單' })).toBeInTheDocument();
    expect(btn).toHaveAccessibleName('關閉選單');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await user.click(btn);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(btn).toHaveFocus();
  });

  it('點「學生管理」後切換到 /teacher/students 並收起選單（US1-3）', async () => {
    renderLayout();
    const user = userEvent.setup();
    await user.click(await menuButton());
    await user.click(screen.getByRole('link', { name: '學生管理' }));
    expect(await screen.findByRole('heading', { name: '學生管理' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/teacher/students');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('按 Esc 收起後停留原畫面，焦點回到按鈕（US1-4）', async () => {
    renderLayout('/teacher/questions');
    const user = userEvent.setup();
    const btn = await menuButton();
    await user.click(btn);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/teacher/questions');
    expect(btn).toHaveFocus();
  });

  it('頁首按鈕不浮在選單上方；按選單內的「關閉選單」收起，焦點回到頁首按鈕', async () => {
    renderLayout();
    const user = userEvent.setup();
    const btn = await menuButton();
    expect(btn.className).not.toMatch(/(^|\s)z-/);
    await user.click(btn);
    const dialog = screen.getByRole('dialog', { name: '老師功能選單' });
    await user.click(within(dialog).getByRole('button', { name: '關閉選單' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(btn).toHaveFocus();
  });

  it('點遮罩收起選單（US1-4）', async () => {
    renderLayout();
    const user = userEvent.setup();
    await user.click(await menuButton());
    await user.click(screen.getByTestId('side-menu-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('頁首仍保留使用者名稱、修改密碼與登出（邊界：不影響 Layout）', async () => {
    renderLayout();
    expect(await screen.findByText('老師（TEACHER）')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '修改密碼' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument();
  });
});
