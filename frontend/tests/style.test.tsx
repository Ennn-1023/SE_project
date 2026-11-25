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
import { StudentManagePage } from '../src/pages/StudentManagePage';
import { QuestionManagePage } from '../src/pages/QuestionManagePage';
import { draftView } from './questionFixtures';
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
  ['StudentManagePage', () => <StudentManagePage />, true],
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
      // 只有 token 定義檔可以寫色碼（theme.css：Tailwind @theme；tokens.css：002 搶答頁的 CSS 變數）
      if (file.endsWith('theme.css') || file.endsWith('tokens.css')) continue;
      const text = fs.readFileSync(file, 'utf8');
      expect(text, path.relative(SRC, file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    }
  });

  it('錯誤訊息只由 ErrorMessage 元件呈現（role="alert" 不出現在其他檔案）', () => {
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith(`components${path.sep}ErrorMessage.tsx`)) continue;
      // 連線狀態橫幅是即時狀態通知，不是操作錯誤訊息（002 FR-005）
      if (file.endsWith(`components${path.sep}ConnectionBanner.tsx`)) continue;
      const text = fs.readFileSync(file, 'utf8');
      expect(text, path.relative(SRC, file)).not.toContain('role="alert"');
    }
  });
});

describe('題目管理頁的 RWD（003 FR-034、SC-010）', () => {
  async function renderQuestionPage() {
    vi.spyOn(api, 'getGoogleStatus').mockResolvedValue({
      configured: true,
      connected: true,
      googleEmail: 't@example.edu',
    });
    vi.spyOn(api, 'getCurrentDraft').mockResolvedValue({ draft: draftView() });
    vi.spyOn(api, 'getQuestionSet').mockResolvedValue({ questionSet: null });
    const result = await renderPage(<QuestionManagePage />, true);
    await screen.findByRole('grid', { name: '學習單格子' });
    return result;
  }

  it('按鈕與下拉選單觸控區 ≥ 44px（學習單格子另以縮放控制）', async () => {
    const { container } = await renderQuestionPage();
    const controls = [...container.querySelectorAll('button, select')].filter(
      (c) => c.getAttribute('role') !== 'gridcell',
    );
    expect(controls.length).toBeGreaterThan(3);
    for (const c of controls) expect(c.className, c.outerHTML.slice(0, 80)).toContain('min-h-11');
  });

  it('學習單格子在自己的區塊內捲動；頁面元素不設定固定像素寬度', async () => {
    const { container } = await renderQuestionPage();
    const scroll = screen.getByTestId('sheet-grid-scroll');
    expect(scroll.className).toContain('overflow-auto');
    expect(scroll.className).toContain('max-w-full');
    for (const node of container.querySelectorAll<HTMLElement>('*')) {
      expect(node.className.toString()).not.toMatch(/(^|\s)(min-)?w-\[\d+px\]/);
      expect(node.style.width).toBe('');
    }
  });

  it('手機（< 640px）時標註面板為底部面板，平板以上回到版面中', async () => {
    await renderQuestionPage();
    const panel = screen.getByTestId('annotation-panel');
    for (const cls of ['fixed', 'bottom-0', 'inset-x-0', 'sm:static']) {
      expect(panel.className).toContain(cls);
    }
    expect(within(panel).getByRole('button', { name: '收合' })).toBeInTheDocument();
  });
});

/** 取得 CSS 原始碼中某個選擇器（完全相同）的宣告區塊 */
function cssRule(css: string, selector: string): string {
  const normalized = css.replace(/\r\n/g, '\n');
  const start = normalized.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`找不到 CSS 規則：${selector}`);
  const open = normalized.indexOf('{', start);
  return normalized.slice(open + 1, normalized.indexOf('}', open));
}

const zIndex = (rule: string) => Number(rule.match(/z-index:\s*(\d+)/)?.[1]);

describe('007 作答頁倒數列：捲動時固定在頂端（FR-012、contracts/ui-countdown §3）', () => {
  const css = fs.readFileSync(path.join(SRC, 'styles/global.css'), 'utf8');

  it('.answering-head 為 sticky，有不透明背景，z-index 低於斷線提示列', () => {
    const head = cssRule(css, '.answering-head');
    expect(head).toMatch(/position:\s*sticky/);
    expect(head).toMatch(/top:\s*var\(--answering-sticky-top,\s*0\)/);
    expect(head).toMatch(/background:\s*var\(--color-surface\)/);
    const banner = cssRule(css, '.connection-banner');
    expect(zIndex(head)).toBeLessThan(zIndex(banner));
  });

  it('斷線提示列有固定高度，出現時倒數列改停在它下方', () => {
    expect(cssRule(css, '.connection-banner')).toMatch(
      /min-height:\s*var\(--connection-banner-h\)/,
    );
    expect(cssRule(css, '.connection-banner ~ .page')).toMatch(
      /--answering-sticky-top:\s*var\(--connection-banner-h\)/,
    );
  });

  it('html／body 不用 overflow-x: hidden（會讓 body 變成捲動容器、sticky 失效），改用 clip', () => {
    const theme = fs.readFileSync(path.join(SRC, 'styles/theme.css'), 'utf8');
    for (const src of [css, theme]) expect(src).not.toMatch(/overflow-x:\s*hidden/);
    expect(cssRule(css, 'html,\nbody')).toMatch(/overflow-x:\s*clip/);
    expect(theme).toMatch(/\nbody\s*\{[^}]*min-width:\s*320px;[^}]*overflow-x:\s*clip/);
  });

  it('作答欄位有 scroll-margin-top，聚焦時不會被倒數列蓋住', () => {
    const rule = cssRule(css, '.answering textarea,\n.answering input');
    expect(rule).toMatch(/scroll-margin-top:[^;]*var\(--answering-head-h\)/);
  });
});

describe('007 倒數顏色與老師端相同（FR-005～FR-007、contracts/ui-countdown §3）', () => {
  const css = fs.readFileSync(path.join(SRC, 'styles/global.css'), 'utf8');
  const tokens = fs.readFileSync(path.join(SRC, 'styles/tokens.css'), 'utf8');
  const theme = fs.readFileSync(path.join(SRC, 'styles/theme.css'), 'utf8');

  it('平常為深藍（主色），最後十秒為橘（強調色）', () => {
    expect(cssRule(css, '.countdown-value')).toMatch(/color:\s*var\(--color-primary\)/);
    expect(cssRule(css, '.countdown-urgent .countdown-value')).toMatch(
      /color:\s*var\(--color-accent\)/,
    );
  });

  it('不另訂新色：tokens.css 與 theme.css 的主色、強調色同值', () => {
    for (const src of [tokens, theme]) {
      expect(src).toMatch(/--color-primary:\s*#1f3a93;/);
      expect(src).toMatch(/--color-accent:\s*#ff6b4a;/);
    }
  });
});
