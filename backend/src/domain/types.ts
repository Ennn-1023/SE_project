/** 領域型別（對應 diagrams/001-class.puml；資料表見 data-model.md）。 */
export type Role = 'TEACHER' | 'STUDENT';

export interface User {
  id: number;
  account: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  usingDefaultPassword: boolean;
  failedLoginCount: number;
  failedWindowStartedAt: Date | null;
  lockedUntil: Date | null;
  createdAt: Date;
}

export interface Teacher extends User {
  role: 'TEACHER';
}

export interface Student extends User {
  role: 'STUDENT';
  /** 學號，等同 account */
  studentId: string;
  /** null = 未分配 */
  groupNumber: number | null;
}

export interface Session {
  id: string;
  userId: number;
  createdAt: Date;
  lastActiveAt: Date;
  revoked: boolean;
}

export interface GroupSettings {
  groupCount: number;
}

export interface GroupSummary {
  groupNumber: number;
  members: Student[];
  memberCount: number;
}

export interface MyGroupView {
  groupNumber: number | null;
  groupCount: number;
}

export interface CreateStudentInput {
  studentId: string;
  name: string;
}

/** 登入失敗鎖定規則（FR-019、research R7）。 */
export const LOGIN_LOCK = {
  maxFailures: 5,
  windowMs: 15 * 60_000,
  lockMs: 15 * 60_000,
} as const;

/** 組數上限（FR-031）。 */
export const MAX_GROUP_COUNT = 50;

export function isLocked(user: User, now: Date): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
}

export function isUnassigned(student: Student): boolean {
  return student.groupNumber === null;
}

export function isExpired(session: Session, now: Date, idleTimeoutMs: number): boolean {
  return now.getTime() - session.lastActiveAt.getTime() >= idleTimeoutMs;
}

export function isValidGroup(settings: GroupSettings, n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= settings.groupCount;
}

/** 帳號／學號正規化：去除前後空白、轉大寫（FR-015）。 */
export function normalizeAccount(account: string): string {
  return account.trim().toUpperCase();
}
