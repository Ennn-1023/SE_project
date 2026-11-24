/** 介面定義（對應 diagrams/001-class.puml 的 interface）。方法名稱須與類別圖一致。 */
import type { GroupSettings, Session, Student, Teacher, User } from './types.js';

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface UserRepository {
  findById(userId: number): User | null;
  findByAccount(account: string): User | null;
  findStudent(studentId: string): Student | null;
  createTeacher(account: string, displayName: string, hash: string): Teacher;
  /** 學號重複時拋出 DuplicateAccountError */
  createStudent(studentId: string, name: string, hash: string): Student;
  /** 僅在學生仍為未分配時更新；回傳是否更新成功（research R4） */
  updateGroupIfUnassigned(studentId: string, groupNumber: number): boolean;
  updateGroup(studentId: string, groupNumber: number | null): void;
  updatePassword(userId: number, hash: string, isDefault: boolean): void;
  recordLoginFailure(userId: number, now: Date): void;
  resetLoginFailures(userId: number): void;
  listStudents(): Student[];
  findStudentsInGroupsAbove(n: number): Student[];
}

export interface SessionRepository {
  create(session: Session): void;
  findById(id: string): Session | null;
  updateLastActive(id: string, at: Date): void;
  revoke(id: string, at: Date): void;
  revokeAllForUser(userId: number, at: Date): void;
}

export interface GroupSettingsRepository {
  get(): GroupSettings;
  setGroupCount(n: number, at: Date): void;
}

/** 學號（帳號）唯一約束衝突。 */
export class DuplicateAccountError extends Error {
  constructor(readonly account: string) {
    super(`account already exists: ${account}`);
    this.name = 'DuplicateAccountError';
  }
}
