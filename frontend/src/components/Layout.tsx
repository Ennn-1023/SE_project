import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button } from './Button';

/**
 * 共用頁框：RWD 容器、頁首、目前使用者名稱、修改密碼連結與登出按鈕。
 * leading（006）：頁首最左側的插槽，老師頁框放三條線選單按鈕；學生端不傳。
 */
export function Layout({
  title,
  children,
  leading,
}: {
  title: string;
  children: ReactNode;
  leading?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen w-full bg-cream-50 text-ink">
      <header className="border-b border-cream-300 bg-cream-100">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div className="flex items-center gap-1">
            {leading}
            <Link to="/" className="flex min-h-11 items-center text-lg font-bold">
              課程搶答系統
            </Link>
          </div>
          {user ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm break-all">
                {user.displayName}（{user.account}）
              </span>
              <Link
                to="/account/password"
                className="flex min-h-11 items-center rounded-md px-2 text-sm text-primary underline underline-offset-2"
              >
                修改密碼
              </Link>
              <Button variant="ghost" onClick={onLogout}>
                登出
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h2 className="mb-4 text-xl font-bold">{title}</h2>
        {children}
      </main>
    </div>
  );
}
