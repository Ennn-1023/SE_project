import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StudentPage } from './pages/StudentPage';
import { DevLoginPage } from './pages/DevLoginPage';
import { DevTeacherPanel } from './pages/DevTeacherPanel';

function DevPage() {
  return (
    <main className="page page-wide">
      <h1 className="app-title">課堂搶答（開發工具）</h1>
      <p className="muted">
        建議在另一個瀏覽器分頁或無痕視窗登入學生，這一頁保留模擬老師操作。
      </p>
      <div className="dev-grid">
        <DevLoginPage />
        <DevTeacherPanel />
      </div>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StudentPage />} />
        {import.meta.env.DEV && <Route path="/dev" element={<DevPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
