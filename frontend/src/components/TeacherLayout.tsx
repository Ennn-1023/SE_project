import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Layout } from './Layout';
import { SIDE_MENU_ID, SideMenu } from './SideMenu';
import { TEACHER_NAV_ITEMS } from './teacherNav';

export interface TeacherLayoutProps {
  title: string;
  children: ReactNode;
}

/**
 * TeacherLayout（006 組件圖）：老師畫面的頁框。在共用 Layout 頁首左上角放三條線按鈕，
 * 按下後由左側滑出 SideMenu；路由改變時自動收起，收起後焦點回到按鈕（data-model §2）。
 */
export function TeacherLayout({ title, children }: TeacherLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (wasOpen.current && !menuOpen) buttonRef.current?.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  const menuButton = (
    <button
      ref={buttonRef}
      type="button"
      data-variant="ghost"
      aria-label={menuOpen ? '關閉選單' : '開啟選單'}
      aria-expanded={menuOpen}
      aria-controls={SIDE_MENU_ID}
      onClick={() => setMenuOpen((v) => !v)}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink hover:bg-cream-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none">
        <path
          d="M4 6h16M4 12h16M4 18h16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  return (
    <>
      <Layout title={title} leading={menuButton}>
        {children}
      </Layout>
      <SideMenu
        open={menuOpen}
        currentPath={pathname}
        items={TEACHER_NAV_ITEMS}
        onClose={() => setMenuOpen(false)}
      />
    </>
  );
}
