import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { isCurrentNav, type TeacherNavItem } from './teacherNav';

export interface SideMenuProps {
  open: boolean;
  currentPath: string;
  items: readonly TeacherNavItem[];
  onClose: () => void;
}

export const SIDE_MENU_ID = 'teacher-side-menu';

/**
 * SideMenu（006 組件圖、contracts/ui-routes.md §2.2）：左側抽屜選單。
 * 打開時焦點移到第一項，Tab／Shift+Tab 只在項目間循環；Esc 或點遮罩關閉。
 */
export function SideMenu({ open, currentPath, items, onClose }: SideMenuProps) {
  const linksRef = useRef<(HTMLAnchorElement | null)[]>([]);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) linksRef.current[0]?.focus();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    // 焦點只在選單內的按鈕與連結間循環（關閉按鈕＋各項目）
    const focusables = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [],
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-40" onKeyDown={onKeyDown}>
      <div
        data-testid="side-menu-backdrop"
        aria-hidden="true"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        id={SIDE_MENU_ID}
        role="dialog"
        aria-modal="true"
        aria-label="老師功能選單"
        className="absolute inset-y-0 left-0 flex w-[min(80vw,18rem)] flex-col gap-1 overflow-y-auto border-r border-cream-300 bg-cream-100 p-3 shadow-lg motion-safe:animate-[side-menu-in_150ms_ease-out]"
      >
        {/* 選單蓋住頁首的三條線按鈕，因此在同一位置提供關閉按鈕 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-variant="ghost"
            aria-label="關閉選單"
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink hover:bg-cream-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <p className="text-sm font-bold text-ink/70">功能選單</p>
        </div>
        <nav aria-label="老師功能">
          <ul className="flex flex-col gap-1">
            {items.map((item, i) => {
              const current = isCurrentNav(item, currentPath);
              return (
                <li key={item.path}>
                  <Link
                    ref={(el) => {
                      linksRef.current[i] = el;
                    }}
                    to={item.path}
                    aria-current={current ? 'page' : undefined}
                    onClick={onClose}
                    className={`flex min-h-11 items-center rounded-md px-3 font-medium ${
                      current ? 'bg-primary font-bold text-white' : 'text-ink hover:bg-cream-300'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
