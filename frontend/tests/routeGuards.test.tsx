import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { api, authEvents, UNAUTHENTICATED_EVENT } from '../src/api/apiClient';
import { AuthProvider } from '../src/auth/AuthContext';
import { AppRoutes } from '../src/main';
import { mockMe, studentUser, teacherUser } from './utils';
import { createFakeTeacherSocket, noneView, readiness } from './activityFixtures';

// 006：/teacher 是搶答活動頁，會建立老師即時連線；以假 socket 取代真實連線
vi.mock('../src/realtime/socket', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/realtime/socket')>();
  return { ...actual, createTeacherSocket: () => createFakeTeacherSocket().factory() };
});

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
  vi.spyOn(api, 'getActivity').mockResolvedValue(noneView());
  vi.spyOn(api, 'getGoogleStatus').mockResolvedValue({ configured: true, connected: false });
  vi.spyOn(api, 'getCurrentDraft').mockResolvedValue({ draft: null });
  vi.spyOn(api, 'getQuestionSet').mockResolvedValue({ questionSet: null });
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

  it('學生造訪 /teacher/students 顯示「此功能僅限老師使用」（006 FR-010）', async () => {
    mockMe(studentUser);
    renderApp('/teacher/students');
    expect(await screen.findByText('此功能僅限老師使用')).toBeInTheDocument();
  });

  it('未登入造訪 /teacher/students 導向 /login（006 FR-010，邊界）', async () => {
    mockMe(null);
    renderApp('/teacher/students');
    expect(await screen.findByLabelText('學號／帳號')).toBeInTheDocument();
  });

  it('老師可從側邊選單前往題目管理（003 FR-033、006 FR-003）', async () => {
    mockMe(teacherUser);
    renderApp('/teacher');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '開啟選單' }));
    await user.click(screen.getByRole('link', { name: '題目管理' }));
    expect(await screen.findByRole('heading', { name: '題目管理' })).toBeInTheDocument();
  });

  it('已登入老師造訪 / 落在搶答活動（006 FR-001）', async () => {
    mockMe(teacherUser);
    renderApp('/');
    expect(await screen.findByRole('heading', { name: '搶答活動' })).toBeInTheDocument();
  });

  it('老師造訪 /teacher 顯示搶答活動（006 FR-001、US1-5）', async () => {
    mockMe(teacherUser);
    renderApp('/teacher');
    expect(await screen.findByRole('heading', { name: '搶答活動' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開啟選單' })).toBeInTheDocument();
  });

  it('舊網址 /teacher/activity 導回 /teacher 的搶答活動（006 research R2）', async () => {
    mockMe(teacherUser);
    renderApp('/teacher/activity');
    expect(await screen.findByRole('heading', { name: '搶答活動' })).toBeInTheDocument();
  });

  it('學生頁面沒有側邊選單按鈕（006 FR-007）', async () => {
    mockMe(studentUser);
    renderApp('/student');
    expect(await screen.findByRole('heading', { name: '學生首頁' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '開啟選單' })).toBeNull();
  });

  it('經選單切到學生管理再切回搶答活動時，重新取得活動狀態（006 spec Edge Cases）', async () => {
    mockMe(teacherUser);
    const getActivity = vi
      .spyOn(api, 'getActivity')
      .mockResolvedValueOnce(noneView())
      .mockResolvedValueOnce(
        noneView({ readiness: readiness({ sourceTitle: '第二次回應的學習單' }) }),
      );
    renderApp('/teacher');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: '搶答活動' });
    await user.click(await screen.findByRole('button', { name: '開啟選單' }));
    await user.click(screen.getByRole('link', { name: '學生管理' }));
    await screen.findByRole('heading', { name: '學生管理' });
    await user.click(screen.getByRole('button', { name: '開啟選單' }));
    await user.click(screen.getByRole('link', { name: '搶答活動' }));
    expect(await screen.findByText(/第二次回應的學習單/)).toBeInTheDocument();
    expect(getActivity).toHaveBeenCalledTimes(2);
  });

  it('不存在的路徑顯示 404 頁', async () => {
    mockMe(null);
    renderApp('/no-such-page');
    expect(await screen.findByText('找不到這個頁面')).toBeInTheDocument();
  });

  it('老師造訪 /dev 顯示「找不到這個頁面」（006 FR-013）', async () => {
    mockMe(teacherUser);
    renderApp('/dev');
    expect(await screen.findByText('找不到這個頁面')).toBeInTheDocument();
  });

  it.each(['/teacher', '/teacher/questions', '/teacher/students'])(
    '%s 與側邊選單都沒有開發工具入口（006 FR-012、SC-006）',
    async (path) => {
      expect(import.meta.env.DEV).toBe(true);
      mockMe(teacherUser);
      renderApp(path);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: '開啟選單' }));
      expect(screen.getByRole('dialog', { name: '老師功能選單' })).toBeInTheDocument();
      expect(screen.queryByText(/模擬老師搶答操作/)).toBeNull();
    },
  );

  it('API 回 401 UNAUTHENTICATED 時導向 /login', async () => {
    mockMe(teacherUser);
    renderApp('/teacher');
    await screen.findByRole('heading', { name: '搶答活動' });
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
