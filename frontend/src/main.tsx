import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router';
import type { Role } from './api/apiClient';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Button } from './components/Button';
import { ErrorMessage } from './components/ErrorMessage';
import { Layout } from './components/Layout';
import { ActivityControlPage } from './pages/ActivityControlPage';
import { ChangePasswordForm } from './pages/ChangePasswordForm';
import { DevTeacherPanel } from './pages/DevTeacherPanel';
import { homePathFor, LoginPage } from './pages/LoginPage';
import { QuestionManagePage } from './pages/QuestionManagePage';
import { StudentHome } from './pages/StudentHome';
import { StudentPage } from './pages/StudentPage';
import { TeacherDashboard } from './pages/TeacherDashboard';
import './styles/theme.css';

const FORBIDDEN_TEXT: Record<Role, string> = {
  TEACHER: '此功能僅限老師使用',
  STUDENT: '此頁僅限學生使用',
};

function Loading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-cream-50 text-ink"
      role="status"
    >
      載入中…
    </div>
  );
}

function Forbidden({ role }: { role: Role }) {
  const navigate = useNavigate();
  return (
    <Layout title="無法使用此頁面">
      <div className="flex flex-col items-start gap-4 rounded-xl border border-cream-300 bg-cream-100 p-4">
        <ErrorMessage message={FORBIDDEN_TEXT[role]} hint="請回到首頁，或以正確的帳號登入" />
        <Button onClick={() => navigate('/', { replace: true })}>回到首頁</Button>
      </div>
    </Layout>
  );
}

/** 路由守衛（ui-routes.md）：未登入導向 /login；角色不符顯示拒絕訊息。權限以後端為準（FR-021）。 */
function Guard({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Forbidden role={role} />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream-50 px-4 text-ink">
      <h1 className="text-2xl font-bold">找不到這個頁面</h1>
      <p>請確認網址是否正確。</p>
      <a
        href="/"
        className="flex min-h-11 items-center rounded-md bg-primary px-4 font-medium text-white"
      >
        回到首頁
      </a>
    </div>
  );
}

/** 路由表（contracts/ui-routes.md）。 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/teacher"
        element={
          <Guard role="TEACHER">
            <TeacherDashboard />
          </Guard>
        }
      />
      <Route
        path="/teacher/activity"
        element={
          <Guard role="TEACHER">
            <ActivityControlPage />
          </Guard>
        }
      />
      <Route
        path="/teacher/questions"
        element={
          <Guard role="TEACHER">
            <QuestionManagePage />
          </Guard>
        }
      />
      <Route
        path="/student"
        element={
          <Guard role="STUDENT">
            <StudentHome />
          </Guard>
        }
      />
      <Route
        path="/student/buzzer"
        element={
          <Guard role="STUDENT">
            <StudentPage />
          </Guard>
        }
      />
      {import.meta.env.DEV && (
        <Route
          path="/dev"
          element={
            <Guard role="TEACHER">
              <Layout title="模擬老師搶答操作（開發工具）">
                <DevTeacherPanel />
              </Layout>
            </Guard>
          }
        />
      )}
      <Route
        path="/account/password"
        element={
          <Guard>
            <ChangePasswordForm />
          </Guard>
        }
      />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

const rootElement = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
