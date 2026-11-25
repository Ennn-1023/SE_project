/** SideMenu（006 US1、FR-003～FR-006；contracts/ui-routes.md §2.2、data-model §1） */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SideMenu } from '../src/components/SideMenu';
import { isCurrentNav, TEACHER_NAV_ITEMS } from '../src/components/teacherNav';

function renderMenu(open: boolean, currentPath = '/teacher') {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={[currentPath]}>
      <SideMenu open={open} currentPath={currentPath} items={TEACHER_NAV_ITEMS} onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

const dialog = () => screen.getByRole('dialog', { name: '老師功能選單' });
const links = () => within(dialog()).getAllByRole('link');

describe('TEACHER_NAV_ITEMS 與 isCurrentNav（data-model §1）', () => {
  it('固定三項且順序為搶答活動、題目管理、學生管理（正常）', () => {
    expect(TEACHER_NAV_ITEMS.map((i) => [i.label, i.path])).toEqual([
      ['搶答活動', '/teacher'],
      ['題目管理', '/teacher/questions'],
      ['學生管理', '/teacher/students'],
    ]);
  });

  it.each([
    ['/teacher', '搶答活動'],
    ['/teacher/', '搶答活動'],
    ['/teacher/questions', '題目管理'],
    ['/teacher/students', '學生管理'],
    ['/teacher/students/', '學生管理'],
  ])('%s 的目前項目是 %s（含結尾斜線的邊界）', (path, label) => {
    expect(TEACHER_NAV_ITEMS.filter((i) => isCurrentNav(i, path)).map((i) => i.label)).toEqual([
      label,
    ]);
  });

  it('不相關的路徑沒有目前項目（邊界）', () => {
    expect(TEACHER_NAV_ITEMS.some((i) => isCurrentNav(i, '/teacher/questionsX'))).toBe(false);
    expect(TEACHER_NAV_ITEMS.some((i) => isCurrentNav(i, '/account/password'))).toBe(false);
  });
});

describe('SideMenu', () => {
  it('open=false 時不渲染（邊界）', () => {
    renderMenu(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('打開時為 modal dialog，三個項目依序排列，目前項目有 aria-current，焦點在第一項（正常）', () => {
    renderMenu(true, '/teacher/questions');
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(links().map((l) => l.textContent)).toEqual(['搶答活動', '題目管理', '學生管理']);
    expect(links().map((l) => l.getAttribute('href'))).toEqual([
      '/teacher',
      '/teacher/questions',
      '/teacher/students',
    ]);
    expect(links().filter((l) => l.getAttribute('aria-current') === 'page')).toEqual([links()[1]]);
    for (const l of links()) expect(l.className).toContain('min-h-11');
    expect(links()[0]).toHaveFocus();
  });

  it('按 Esc、點遮罩、點項目都會呼叫 onClose（正常）', async () => {
    const onClose = renderMenu(true);
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('side-menu-backdrop'));
    await user.click(links()[2]!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('Tab／Shift+Tab 只在選單內的關閉按鈕與項目之間循環（邊界：焦點不跑到背景）', async () => {
    renderMenu(true);
    const user = userEvent.setup();
    const close = within(dialog()).getByRole('button', { name: '關閉選單' });
    await user.tab();
    await user.tab();
    expect(links()[2]).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(links()[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(links()[2]).toHaveFocus();
  });

  it('選單內有「關閉選單」按鈕，點了呼叫 onClose（選單蓋住頁首按鈕時仍可關閉）', async () => {
    const onClose = renderMenu(true);
    const close = within(dialog()).getByRole('button', { name: '關閉選單' });
    expect(close.className).toContain('min-h-11');
    await userEvent.setup().click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('不含開發工具、修改密碼與登出（邊界）', () => {
    renderMenu(true);
    expect(within(dialog()).queryByText(/模擬老師搶答操作|修改密碼|登出/)).toBeNull();
  });
});
