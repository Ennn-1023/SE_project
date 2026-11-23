import type { Config } from '../config/env.js';
import {
  DuplicateAccountError,
  type PasswordHasher,
  type UserRepository,
} from '../domain/ports.js';
import {
  normalizeAccount,
  type CreateStudentInput,
  type Student,
  type Teacher,
} from '../domain/types.js';
import type { Clock } from '../lib/clock.js';
import { AppError, ErrorCodes } from '../lib/errors.js';
import type { SessionService } from './sessionService.js';

export const TEACHER_DISPLAY_NAME = '老師';

export const studentNotFound = (studentId: string) =>
  new AppError(ErrorCodes.NOT_FOUND, `找不到學號 ${studentId} 的學生`, {
    field: 'studentId',
    hint: '請確認學號是否正確，或先建立該學生帳號',
  });

/** AccountService：建立學生帳號、清單、重設密碼與初始化老師帳號。 */
export class AccountService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionService,
    private readonly hasher: PasswordHasher,
    private readonly config: Pick<
      Config,
      'studentDefaultPassword' | 'teacherAccount' | 'teacherInitialPassword'
    >,
    private readonly clock: Clock,
  ) {}

  /** 依 diagrams/001-sequence-create-student.puml：預設密碼雜湊、未分配；學號重複回 409。 */
  async createStudent(input: CreateStudentInput): Promise<Student> {
    const studentId = normalizeAccount(input.studentId);
    const name = input.name.trim();
    const hash = await this.hasher.hash(this.config.studentDefaultPassword);
    try {
      return this.users.createStudent(studentId, name, hash);
    } catch (err) {
      if (err instanceof DuplicateAccountError) {
        throw new AppError(ErrorCodes.STUDENT_EXISTS, `學號 ${studentId} 已存在`, {
          field: 'studentId',
          hint: '學號不分大小寫；如需重設該生密碼，請在學生清單使用「重設密碼」',
        });
      }
      throw err;
    }
  }

  listStudents(): Student[] {
    return this.users.listStudents();
  }

  /** 將學生密碼重設為預設密碼，解除鎖定，並撤銷其所有 session（FR-025）。 */
  async resetPassword(studentId: string): Promise<void> {
    const student = this.users.findStudent(normalizeAccount(studentId));
    if (!student) throw studentNotFound(normalizeAccount(studentId));
    const hash = await this.hasher.hash(this.config.studentDefaultPassword);
    this.users.updatePassword(student.id, hash, true);
    this.users.resetLoginFailures(student.id);
    this.sessions.revokeAllForUser(student.id);
  }

  /** 建立老師帳號；已存在則略過，不覆蓋既有密碼（FR-016、FR-024）。 */
  async seedTeacher(): Promise<Teacher> {
    const account = normalizeAccount(this.config.teacherAccount);
    const existing = this.users.findByAccount(account);
    if (existing) return existing as Teacher;
    const hash = await this.hasher.hash(this.config.teacherInitialPassword);
    return this.users.createTeacher(account, TEACHER_DISPLAY_NAME, hash);
  }
}
