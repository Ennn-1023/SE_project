import type { GroupSettingsRepository, UserRepository } from '../domain/ports.js';
import {
  isValidGroup,
  normalizeAccount,
  type GroupSettings,
  type GroupSummary,
  type MyGroupView,
  type Student,
} from '../domain/types.js';
import type { Clock } from '../lib/clock.js';
import { AppError, ErrorCodes } from '../lib/errors.js';
import { studentNotFound } from './accountService.js';

export const rangeError = (field: string, groupCount: number) =>
  new AppError(
    ErrorCodes.VALIDATION_ERROR,
    groupCount === 0 ? '目前沒有可選的組別' : `可選範圍為 1–${groupCount}`,
    {
      field,
      hint: groupCount === 0 ? '請先設定組數' : `請選擇 1–${groupCount} 之間的組別`,
      details: { groupCount },
    },
  );

/** GroupService：依 diagrams/001-sequence-group.puml 管理組數、學生自選與老師指派。 */
export class GroupService {
  constructor(
    private readonly users: UserRepository,
    private readonly settings: GroupSettingsRepository,
    private readonly clock: Clock,
    private readonly runInTransaction: <T>(fn: () => T) => T,
  ) {}

  getSettings(): GroupSettings {
    return this.settings.get();
  }

  getMyGroup(studentId: string): MyGroupView {
    const student = this.requireStudent(studentId);
    return { groupNumber: student.groupNumber, groupCount: this.settings.get().groupCount };
  }

  /** 學生自選（僅限未分配，FR-034、FR-035）：以條件式更新避免與老師指派競態。 */
  selfSelect(studentId: string, groupNumber: number): Student {
    const { groupCount } = this.settings.get();
    if (groupCount === 0) {
      throw new AppError(ErrorCodes.GROUPS_NOT_OPEN, '老師尚未開放分組', {
        hint: '請等老師設定組數後再選組',
      });
    }
    if (!isValidGroup({ groupCount }, groupNumber)) {
      throw rangeError('groupNumber', groupCount);
    }
    const id = normalizeAccount(studentId);
    if (!this.users.updateGroupIfUnassigned(id, groupNumber)) {
      const current = this.requireStudent(id);
      throw new AppError(ErrorCodes.ALREADY_ASSIGNED, '你已分組，如需更換請洽老師', {
        details: { currentGroupNumber: current.groupNumber },
      });
    }
    return this.requireStudent(id);
  }

  /** 老師設定組數（FR-031、FR-032）：在交易內檢查被移除的組別是否仍有成員。 */
  setGroupCount(n: number): GroupSettings {
    return this.runInTransaction(() => {
      const blocking = this.users.findStudentsInGroupsAbove(n);
      if (blocking.length > 0) {
        const groups = new Map<number, Student[]>();
        for (const s of blocking) {
          const list = groups.get(s.groupNumber!) ?? [];
          list.push(s);
          groups.set(s.groupNumber!, list);
        }
        const numbers = [...groups.keys()].sort((a, b) => a - b);
        throw new AppError(
          ErrorCodes.GROUP_NOT_EMPTY,
          `第 ${numbers.join('、')} 組仍有成員，無法將組數調降為 ${n}`,
          {
            field: 'groupCount',
            hint: '請先將這些學生移到其他組或改回未分配',
            details: {
              blockingGroups: numbers.map((g) => ({
                groupNumber: g,
                members: groups
                  .get(g)!
                  .map((s) => ({ studentId: s.studentId, name: s.displayName })),
              })),
            },
          },
        );
      }
      this.settings.setGroupCount(n, this.clock.now());
      return this.settings.get();
    });
  }

  /** 老師指派學生到 1..N 或改回未分配（null）（FR-036）。 */
  assign(studentId: string, groupNumber: number | null): Student {
    const student = this.requireStudent(studentId);
    if (groupNumber !== null) {
      const { groupCount } = this.settings.get();
      if (!isValidGroup({ groupCount }, groupNumber)) throw rangeError('groupNumber', groupCount);
    }
    this.users.updateGroup(student.studentId, groupNumber);
    return this.requireStudent(student.studentId);
  }

  /** 組別總覽：1..N 每一組（含 0 人）（FR-038）。 */
  overview(): GroupSummary[] {
    const { groupCount } = this.settings.get();
    const students = this.users.listStudents();
    return Array.from({ length: groupCount }, (_, i) => {
      const members = students.filter((s) => s.groupNumber === i + 1);
      return { groupNumber: i + 1, members, memberCount: members.length };
    });
  }

  unassigned(): Student[] {
    return this.users.listStudents().filter((s) => s.groupNumber === null);
  }

  private requireStudent(studentId: string): Student {
    const id = normalizeAccount(studentId);
    const student = this.users.findStudent(id);
    if (!student) throw studentNotFound(id);
    return student;
  }
}
