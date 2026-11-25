/** 老師側邊選單的導覽項目（006 data-model §1、FR-003）。 */
export interface TeacherNavItem {
  /** 顯示名稱：搶答活動／題目管理／學生管理 */
  label: string;
  /** 對應路由，以 /teacher 開頭 */
  path: string;
}

/** 固定 3 項，順序不可變（FR-003）。 */
export const TEACHER_NAV_ITEMS: readonly TeacherNavItem[] = [
  { label: '搶答活動', path: '/teacher' },
  { label: '題目管理', path: '/teacher/questions' },
  { label: '學生管理', path: '/teacher/students' },
];

/** 目前所在項目的判斷（data-model §1）：搶答活動需完全相符，其餘以前綴判斷。 */
export function isCurrentNav(item: TeacherNavItem, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (item.path === '/teacher') return path === '/teacher';
  return path === item.path || path.startsWith(`${item.path}/`);
}
