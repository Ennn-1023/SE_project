import type { CurrentUser, Role, StudentSummary } from "@se/shared";
import type { Database } from "../lib/db.js";

/** users 資料列（data-model.md User）。 */
export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  group_label: string | null;
  password_hash: string;
  uses_default_password: number;
  password_changed_at: string;
  created_by_id: string | null;
  created_at: string;
}

export function findUserByUsername(db: Database, username: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
}

export function findUserById(db: Database, id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function insertUser(db: Database, row: UserRow): void {
  db.prepare(
    `INSERT INTO users (id, username, display_name, role, group_label, password_hash,
       uses_default_password, password_changed_at, created_by_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.username,
    row.display_name,
    row.role,
    row.group_label,
    row.password_hash,
    row.uses_default_password,
    row.password_changed_at,
    row.created_by_id,
    row.created_at,
  );
}

export function updatePassword(
  db: Database,
  userId: string,
  passwordHash: string,
  usesDefaultPassword: boolean,
  changedAt: string,
): void {
  db.prepare(
    `UPDATE users SET password_hash = ?, uses_default_password = ?, password_changed_at = ?
     WHERE id = ?`,
  ).run(passwordHash, usesDefaultPassword ? 1 : 0, changedAt, userId);
}

/** 對外的使用者資料：永遠不含 password_hash。 */
export function toCurrentUser(row: UserRow): CurrentUser {
  return {
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    usesDefaultPassword: row.uses_default_password === 1,
  };
}

export function toStudentSummary(row: UserRow): StudentSummary {
  return {
    studentId: row.username,
    name: row.display_name,
    group: row.group_label,
    usesDefaultPassword: row.uses_default_password === 1,
    createdAt: row.created_at,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
