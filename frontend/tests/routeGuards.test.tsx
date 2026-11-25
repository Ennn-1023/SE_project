import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { api, authEvents, UNAUTHENTICATED_EVENT } from '../src/api/apiClient';
import { AuthProvider } from '../src/auth/AuthContext';
import { AppRoutes } from '../src/main';
import { mockMe, studentUser, teacherUser } from './utils';

function renderApp(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const loginHeading = () => screen.findByRole('heading', { name: '課程搶答系統', level: 1 });

beforeEach(() => {
  vi.spyOn(api, 'listStudents').mockResolvedValue({ students: [] });
  vi.spyOn(api, 'groupOverview').mockResolvedValue({ groupCount: 0, groups: [], unassigned: [] });
  vi.spyOn(api, 'myGroup').mockResolvedValue({ groupNumber: null, groupCount: 0 });
});
afterEach(() => vi.restoreAllMocks());

describe('路由守衛（US2、contracts/ui-routes.md）', () => {
  it.each(['/teacher', '/student', '/account/password', '/'])(
    '未登入造訪 %s 導向 /login',
    async (path) => {
      mockMe(null);
      renderApp(path);
      expect(await screen.findByLabelText('學號／帳號')).toBeInTheDocument();
    },
  );

  it('學生造訪 /teacher 顯示「此功能僅限老師使用」並可回首頁', async () => {
    mockMe(studentUser);
    renderApp('/teacher');
    expect(await screen.findByText('此功能僅限老師使用')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '回到首頁' }));
    expect(await screen.findByRole('heading', { name: '學生首頁' })).toBeInTheDocument();
  });

  it('老師造訪 /student 顯示「此頁僅限學生使用」', async () => {
    mockMe(teacherUser);
    renderApp('/student');
    expect(await screen.findByText('此頁僅限學生使用')).toBeInTheDocument();
  });

  it('學生造訪 /teacher/questions 顯示「此功能僅限老師使用」（003 FR-031）', async () => {
    mockMe(studentUser);
    renderApp('/teacher/questions');
    expect(await screen.findByText('此功能僅限老師使用')).toBeInTheDocument();
  });

  it('老師管理頁有「題目管理」按鈕可前往 /teacher/questions（003 FR-033）', async () => {
    mockMe(teacherUser);
    vi.spyOn(api, 'getGoogleStatus').mockResolvedValue({ configured: true, connected: false });
    vi.spyOn(api, 'getCurrentDraft').mockResolvedValue({ draft: null });
    vi.spyOn(api, 'getQuestionSet').mockResolvedValue({ questionSet: null });
    renderApp('/teacher');
    await userEvent.setup().click(await screen.findByRole('link', { name: '題目管理' }));
    expect(await screen.findByRole('heading', { name: '題目管理' })).toBeInTheDocument();
  });

  it('已登入造訪 / 依角色導向', async () => {
    mockMe(teacherUser);
    renderApp('/');
    expect(await screen.findByRole('heading', { name: '老師管理頁' })).toBeInTheDocument();
  });

  it('不存在的路徑顯示 404 頁', async () => {
    mockMe(null);
    renderApp('/no-such-page');
    expect(await screen.findByText('找不到這個頁面')).toBeInTheDocument();
  });

  it('API 回 401 UNAUTHENTICATED 時導向 /login', async () => {
    mockMe(teacherUser);
    renderApp('/teacher');
    await screen.findByRole('heading', { name: '老師管理頁' });
    act(() => {
      authEvents.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    });
    expect(await screen.findByLabelText('學號／帳號')).toBeInTheDocument();
  });

  it('登出按鈕呼叫登出 API 並回到登入頁，顯示目前使用者名稱', async () => {
    mockMe(teacherUser);
    const logout = vi.spyOn(api, 'logout').mockResolvedValue(undefined);
    renderApp('/teacher');
    expect(await screen.findByText('老師（TEACHER）')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '登出' }));
    expect(logout).toHaveBeenCalledTimes(1);
    await loginHeading();
    await waitFor(() => expect(screen.getByLabelText('學號／帳號')).toBeInTheDocument());
  });
});
