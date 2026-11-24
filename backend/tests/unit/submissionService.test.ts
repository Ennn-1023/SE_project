import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/data/db';
import { Repository } from '../../src/data/repositories';
import { seedMockData } from '../../src/data/mock/seed';
import { ActivityStateMachine } from '../../src/domain/activityStateMachine';
import { SubmissionService } from '../../src/domain/submissionService';
import type { Student } from '../../src/domain/buzzerTypes';
import { AppError } from '../../src/http/errors';

const A1: Student = { studentId: 'S101', name: '王小明', teamId: 'T1' };
const A2: Student = { studentId: 'S102', name: '李小華', teamId: 'T1' };
const B: Student = { studentId: 'S201', name: '陳大文', teamId: 'T2' };
const NONE: Student = { studentId: 'S900', name: '黃未分', teamId: null };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : `non-AppError: ${String(e)}`;
  }
  return undefined;
}

describe('SubmissionService', () => {
  let machine: ActivityStateMachine;
  let svc: SubmissionService;

  beforeEach(() => {
    const repo = new Repository(openDb(':memory:'));
    seedMockData(repo);
    machine = new ActivityStateMachine(repo);
    svc = new SubmissionService(machine);
    machine.hooks.onQuestionOpened = (q) => svc.startQuestion(q);
    machine.open('Q1', 60);
  });

  afterEach(() => machine.dispose());

  it('依伺服器收到的順序指派 rank，並記錄送出者與伺服器時間', () => {
    const before = Date.now();
    const b = svc.submit(B, 'Q1', ' B 的答案 ');
    const a = svc.submit(A1, 'Q1', 'A 的答案');
    expect(b).toMatchObject({ teamId: 'T2', studentId: 'S201', answer: 'B 的答案', rank: 1, questionId: 'Q1', activityId: 'A1' });
    expect(a).toMatchObject({ teamId: 'T1', rank: 2 });
    expect(b.receivedAt).toBeGreaterThanOrEqual(before);
    expect(svc.all().map((s) => s.teamId)).toEqual(['T2', 'T1']);
  });

  it('同組第二次送出（含同組另一位成員）回 ALREADY_SUBMITTED，且不改變原紀錄', () => {
    svc.submit(A1, 'Q1', '第一次');
    expect(codeOf(() => svc.submit(A1, 'Q1', '第二次'))).toBe('ALREADY_SUBMITTED');
    expect(codeOf(() => svc.submit(A2, 'Q1', '組員送出'))).toBe('ALREADY_SUBMITTED');
    expect(svc.forTeam('T1')).toMatchObject({ answer: '第一次', studentId: 'S101' });
    expect(svc.all()).toHaveLength(1);
  });

  it('未分組回 NO_TEAM', () => {
    expect(codeOf(() => svc.submit(NONE, 'Q1', '答案'))).toBe('NO_TEAM');
  });

  it('questionId 不是目前開放的題目回 QUESTION_NOT_OPEN', () => {
    expect(codeOf(() => svc.submit(B, 'Q2', '答案'))).toBe('QUESTION_NOT_OPEN');
  });

  it('WAITING 時送出回 QUESTION_NOT_OPEN', () => {
    machine.manualClose();
    machine.next();
    expect(codeOf(() => svc.submit(B, 'Q1', '答案'))).toBe('QUESTION_NOT_OPEN');
  });

  it('空白答案回 EMPTY_ANSWER，501 字回 ANSWER_TOO_LONG，被拒後本組仍可送出', () => {
    expect(codeOf(() => svc.submit(B, 'Q1', '   '))).toBe('EMPTY_ANSWER');
    expect(codeOf(() => svc.submit(B, 'Q1', 'x'.repeat(501)))).toBe('ANSWER_TOO_LONG');
    expect(svc.submit(B, 'Q1', 'x'.repeat(500)).rank).toBe(1);
  });

  it('開放新題目時清空上一題的送出', () => {
    svc.submit(B, 'Q1', '答案');
    machine.manualClose();
    machine.next();
    machine.open('Q2', 60);
    expect(svc.all()).toEqual([]);
    expect(svc.submit(B, 'Q2', '新答案').rank).toBe(1);
  });
});
