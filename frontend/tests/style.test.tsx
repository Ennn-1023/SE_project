import fs from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/apiClient';
import { AuthProvider } from '../src/auth/AuthContext';
import { ChangePasswordForm } from '../src/pages/ChangePasswordForm';
import { GroupManagePanel } from '../src/pages/GroupManagePanel';
import { LoginPage } from '../src/pages/LoginPage';
import { StudentCreatePanel } from '../src/pages/StudentCreatePanel';
import { StudentHome } from '../src/pages/StudentHome';
import { TeacherDashboard } from '../src/pages/TeacherDashboard';
import { mockMe, teacherUser } from './utils';

const SRC = path.resolve(__dirname, '../src');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx?|css)$/.test(e.name) ? [p] : [];
  });
}

beforeEach(() => {
  vi.spyOn(api, 'listStudents').mockResolvedValue({
    students: [
      { studentId: 'A0001', name: '甲'.repeat(50), groupNumber: 1, usingDefaultPassword: true },
      { studentId: 'B'.repeat(20), name: '乙', groupNumber: null, usingDefaultPassword: false },
    ],
  });
  vi.spyOn(api, 'groupOverview').mockResolvedValue({
    groupCount: 2,
    groups: [
      { groupNumber: 1, members: [{ studentId: 'A0001', name: '甲' }], memberCount: 1 },
      { groupNumber: 2, members: [], memberCount: 0 },
    ],
    unassigned: [{ studentId: 'B'.repeat(20), name: '乙' }],
  });
  vi.spyOn(api, 'myGroup').mockResolvedValue({ groupNumber: null, groupCount: 6 });
});
afterEach(() => vi.restoreAllMocks());

const PAGES: [string, () => ReactElement, boolean][] = [
  ['LoginPage', () => <LoginPage />, false],
  ['TeacherDashboard', () => <TeacherDashboard />, true],
  ['StudentCreatePanel', () => <StudentCreatePanel />, true],
  ['GroupManagePanel', () => <GroupManagePanel />, true],
  ['StudentHome', () => <StudentHome />, true],
  ['ChangePasswordForm', () => <ChangePasswordForm />, true],
];

async function renderPage(element: ReactElement, loggedIn: boolean) {
  mockMe(loggedIn ? teacherUser : null);
  const result = render(
    <AuthProvider>
      <MemoryRouter>{element}</MemoryRouter>
    </AuthProvider>,
  );
  await screen.findAllByRole('button');
  // 等待非同步載入的清單出現
  await new Promise((r) => setTimeout(r, 0));
  return result;
}

describe('一致外觀與跨裝置可用（US6、FR-003、FR-004）', () => {
  it.each(PAGES)('%s：所有按鈕與下拉選單觸控區 ≥ 44px（min-h-11）', async (_name, el, loggedIn) => {
    const { container } = await renderPage(el(), loggedIn);
    const controls = container.querySelectorAll('button, select');
    expect(controls.length).toBeGreaterThan(0);
    for (const c of controls) {
      expect(c.className, c.outerHTML.slice(0, 80)).toContain('min-h-11');
    }
  });

  it.each(PAGES)(
    '%s：主要按鈕皆使用 Button 元件（具 data-variant）',
    async (_name, el, loggedIn) => {
      const { container } = await renderPage(el(), loggedIn);
      for (const b of container.querySelectorAll('button')) {
        expect(b.getAttribute('data-variant'), b.textContent ?? '').not.toBeNull();
      }
    },
  );

  it.each(PAGES)('%s：根元素不設定固定像素寬度', async (_name, el, loggedIn) => {
    const { container } = await renderPage(el(), loggedIn);
    for (const node of container.querySelectorAll<HTMLElement>('*')) {
      expect(node.className.toString()).not.toMatch(/(^|\s)(min-)?w-\[\d+px\]/);
      expect(node.style.width).toBe('');
    }
  });

  it('學生清單容器具橫向溢出保護，且長學號／姓名可斷行', async () => {
    await renderPage(<StudentCreatePanel />, true);
    const list = await screen.findByRole('list', { name: '學生清單' });
    expect(list.parentElement!.className).toContain('overflow-x-auto');
    const longName = within(list).getByText('甲'.repeat(50));
    expect(longName.className).toMatch(/break-(words|all)/);
  });

  it('學生選組按鈕為 RWD 格狀排列（手機 3 欄、桌機 6 欄）', async () => {
    await renderPage(<StudentHome />, true);
    const btn = await screen.findByRole('button', { name: '第 1 組' });
    expect(btn.parentElement!.className).toContain('grid-cols-3');
    expect(btn.parentElement!.className).toContain('sm:grid-cols-6');
  });

  it('原始碼不得出現硬編碼色碼（一律使用 theme.css token）', () => {
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith('theme.css')) continue;
      const text = fs.readFileSync(file, 'utf8');
      expect(text, path.relative(SRC, file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    }
  });

  it('錯誤訊息只由 ErrorMessage 元件呈現（role="alert" 不出現在其他檔案）', () => {
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith(`components${path.sep}ErrorMessage.tsx`)) continue;
      const text = fs.readFileSync(file, 'utf8');
      expect(text, path.relative(SRC, file)).not.toContain('role="alert"');
    }
  });
});
