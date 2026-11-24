import type { Database } from '../lib/db.js';
import { transaction } from '../lib/db.js';
import {
  DuplicateAccountError,
  type UserRepository as UserRepositoryPort,
} from '../domain/ports.js';
import { LOGIN_LOCK, type Role, type Student, type Teacher, type User } from '../domain/types.js';

interface UserRow {
  id: number;
  account: string;
  display_name: string;
  role: Role;
  password_hash: string;
  using_default_password: number;
  group_number: number | null;
  failed_login_count: number;
  failed_window_started_at: string | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

const toDate = (v: string | null) => (v === null ? null : new Date(v));

function toUser(row: UserRow): User | Student {
  const base: User = {
    id: row.id,
    account: row.account,
    displayName: row.display_name,
    role: row.role,
    passwordHash: row.password_hash,
    usingDefaultPassword: row.using_default_password === 1,
    failedLoginCount: row.failed_login_count,
    failedWindowStartedAt: toDate(row.failed_window_started_at),
    lockedUntil: toDate(row.locked_until),
    createdAt: new Date(row.created_at),
  };
  if (row.role === 'STUDENT') {
    return { ...base, role: 'STUDENT', studentId: row.account, groupNumber: row.group_number };
  }
  return base;
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Error && /UNIQUE constraint failed: users\.account/.test(err.message);

/** UserRepository（data-model.md `users`）。時間由呼叫端的 Clock 提供。 */
export class UserRepository implements UserRepositoryPort {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date,
  ) {}

  private one(sql: string, ...params: (string | number | null)[]): User | Student | null {
    const row = this.db.prepare(sql).get(...params) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  private many(sql: string, ...params: (string | number | null)[]): Student[] {
    return (this.db.prepare(sql).all(...params) as unknown as UserRow[]).map(
      (r) => toUser(r) as Student,
    );
  }

  findById(userId: number): User | null {
    return this.one('SELECT * FROM users WHERE id = ?', userId);
  }

  findByAccount(account: string): User | null {
    return this.one('SELECT * FROM users WHERE account = ?', account);
  }

  findStudent(studentId: string): Student | null {
    return this.one(
      "SELECT * FROM users WHERE account = ? AND role = 'STUDENT'",
      studentId,
    ) as Student | null;
  }

  private insert(
    account: string,
    displayName: string,
    role: Role,
    hash: string,
    isDefault: boolean,
  ) {
    const at = this.now().toISOString();
    try {
      const result = this.db
        .prepare(
          `INSERT INTO users (account, display_name, role, password_hash, using_default_password,
             group_number, failed_login_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
        )
        .run(account, displayName, role, hash, isDefault ? 1 : 0, at, at);
      return this.findById(Number(result.lastInsertRowid))!;
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateAccountError(account);
      throw err;
    }
  }

  createTeacher(account: string, displayName: string, hash: string): Teacher {
    return this.insert(account, displayName, 'TEACHER', hash, false) as Teacher;
  }

  createStudent(studentId: string, name: string, hash: string): Student {
    return this.insert(studentId, name, 'STUDENT', hash, true) as Student;
  }

  updateGroupIfUnassigned(studentId: string, groupNumber: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE users SET group_number = ?, updated_at = ?
         WHERE account = ? AND role = 'STUDENT' AND group_number IS NULL`,
      )
      .run(groupNumber, this.now().toISOString(), studentId);
    return Number(result.changes) === 1;
  }

  updateGroup(studentId: string, groupNumber: number | null): void {
    this.db
      .prepare(
        "UPDATE users SET group_number = ?, updated_at = ? WHERE account = ? AND role = 'STUDENT'",
      )
      .run(groupNumber, this.now().toISOString(), studentId);
  }

  updatePassword(userId: number, hash: string, isDefault: boolean): void {
    this.db
      .prepare(
        'UPDATE users SET password_hash = ?, using_default_password = ?, updated_at = ? WHERE id = ?',
      )
      .run(hash, isDefault ? 1 : 0, this.now().toISOString(), userId);
  }

  /**
   * 記錄一次登入失敗（data-model.md「帳號鎖定」狀態轉換）：
   * 視窗過期或鎖定已到期則開新視窗（計數 = 1）；視窗內達 5 次則鎖定 15 分鐘。
   */
  recordLoginFailure(userId: number, now: Date): void {
    transaction(this.db, () => {
      const user = this.findById(userId);
      if (!user) return;
      const t = now.getTime();
      const windowExpired =
        user.failedWindowStartedAt === null ||
        t - user.failedWindowStartedAt.getTime() >= LOGIN_LOCK.windowMs ||
        (user.lockedUntil !== null && user.lockedUntil.getTime() <= t);
      const count = windowExpired ? 1 : user.failedLoginCount + 1;
      const windowStart = windowExpired ? now : user.failedWindowStartedAt!;
      const lockedUntil =
        count >= LOGIN_LOCK.maxFailures ? new Date(t + LOGIN_LOCK.lockMs).toISOString() : null;
      this.db
        .prepare(
          `UPDATE users SET failed_login_count = ?, failed_window_started_at = ?, locked_until = ?,
             updated_at = ? WHERE id = ?`,
        )
        .run(count, windowStart.toISOString(), lockedUntil, now.toISOString(), userId);
    });
  }

  resetLoginFailures(userId: number): void {
    this.db
      .prepare(
        `UPDATE users SET failed_login_count = 0, failed_window_started_at = NULL, locked_until = NULL,
           updated_at = ? WHERE id = ?`,
      )
      .run(this.now().toISOString(), userId);
  }

  listStudents(): Student[] {
    return this.many("SELECT * FROM users WHERE role = 'STUDENT' ORDER BY account");
  }

  findStudentsInGroupsAbove(n: number): Student[] {
    return this.many(
      "SELECT * FROM users WHERE role = 'STUDENT' AND group_number > ? ORDER BY group_number, account",
      n,
    );
  }
}
