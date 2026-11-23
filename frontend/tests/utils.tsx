import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { vi } from 'vitest';
import { api, ApiError, type CurrentUser } from '../src/api/apiClient';
import { AuthProvider } from '../src/auth/AuthContext';

export const unauthenticated = () =>
  new ApiError(401, 'UNAUTHENTICATED', '請先登入', undefined, '請回到登入頁重新登入');

/** 設定 /api/auth/me 的回應：傳入使用者表示已登入，null 表示未登入。 */
export function mockMe(user: CurrentUser | null) {
  return vi.spyOn(api, 'me').mockImplementation(async () => {
    if (user) return { user };
    throw unauthenticated();
  });
}

export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/** 在 AuthProvider + MemoryRouter 中渲染；extraRoutes 用來觀察導向結果。 */
export function renderAt(path: string, element: ReactElement, routePath = path) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

export const teacherUser: CurrentUser = {
  account: 'TEACHER',
  displayName: '老師',
  role: 'TEACHER',
};
export const studentUser: CurrentUser = {
  account: 'B1103',
  displayName: '王小明',
  role: 'STUDENT',
  groupNumber: null,
};
