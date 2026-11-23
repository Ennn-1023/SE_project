import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../../src/data/db';
import { Repository } from '../../src/data/repositories';
import { seedMockData } from '../../src/data/mock/seed';
import { ActivityStateMachine } from '../../src/domain/activityStateMachine';
import { AppError } from '../../src/http/errors';

function expectAppError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    return;
  }
  throw new Error(`預期拋出 ${code}`);
}

describe('ActivityStateMachine', () => {
  let repo: Repository;
  let machine: ActivityStateMachine;
  let closed: Array<{ questionId: string; reason: string }>;
  let changes: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T02:00:00.000Z'));
    repo = new Repository(openDb(':memory:'));
    seedMockData(repo);
    machine = new ActivityStateMachine(repo);
    closed = [];
    changes = 0;
    machine.hooks.onQuestionClosed = (questionId, reason) => closed.push({ questionId, reason });
    machine.hooks.onChange = () => changes++;
  });

  afterEach(() => {
    machine.dispose();
    vi.useRealTimers();
  });

  it('正常流程：開放 → 時間到自動結束 → 下一題 → 結束活動', () => {
    expect(machine.activity.phase).toBe('WAITING');

    machine.open('Q1', 60);
    expect(machine.activity).toMatchObject({
      phase: 'ANSWERING',
      currentQuestionId: 'Q1',
      endsAt: Date.parse('2026-11-20T02:01:00.000Z'),
    });

    vi.advanceTimersByTime(59_999);
    expect(machine.activity.phase).toBe('ANSWERING');
    vi.advanceTimersByTime(1);
    expect(machine.activity).toMatchObject({ phase: 'CLOSED', currentQuestionId: 'Q1', endsAt: null });
    expect(closed).toEqual([{ questionId: 'Q1', reason: 'TIME_UP' }]);

    machine.next();
    expect(machine.activity).toMatchObject({ phase: 'WAITING', currentQuestionId: null });

    machine.end();
    expect(machine.activity.phase).toBe('ENDED');
    expect(changes).toBe(4);
  });

  it('每次轉換都寫入資料庫', () => {
    machine.open('Q2', 30);
    expect(repo.getCurrentActivity()).toMatchObject({ phase: 'ANSWERING', currentQuestionId: 'Q2' });
    machine.manualClose();
    expect(repo.getCurrentActivity()).toMatchObject({ phase: 'CLOSED', currentQuestionId: 'Q2' });
  });

  it('seconds 省略時預設 60 秒', () => {
    machine.open('Q1');
    expect(machine.activity.endsAt).toBe(Date.now() + 60_000);
  });

  it('時間到與手動結束同時觸發，只結束一次', () => {
    machine.open('Q1', 5);
    vi.advanceTimersByTime(5_000);
    expect(machine.closeQuestion('MANUAL')).toBe(false);
    expect(closed).toHaveLength(1);
    expect(closed[0]?.reason).toBe('TIME_UP');
  });

  it('手動結束後，原本的計時器不會再觸發', () => {
    machine.open('Q1', 10);
    machine.manualClose();
    vi.advanceTimersByTime(20_000);
    expect(closed).toEqual([{ questionId: 'Q1', reason: 'MANUAL' }]);
  });

  it('作答中再開放另一題被拒，且階段不變', () => {
    machine.open('Q1', 60);
    expectAppError(() => machine.open('Q2', 60), 'INVALID_TRANSITION');
    expect(machine.activity).toMatchObject({ phase: 'ANSWERING', currentQuestionId: 'Q1' });
  });

  it.each([0, 4, 601, 1.5, Number.NaN, '60', 'abc', null])('秒數 %s 回 INVALID_SECONDS', (s) => {
    expectAppError(() => machine.open('Q1', s as unknown as number), 'INVALID_SECONDS');
    expect(machine.activity.phase).toBe('WAITING');
  });

  it('秒數邊界 5 與 600 可以開放', () => {
    machine.open('Q1', 5);
    machine.manualClose();
    machine.next();
    machine.open('Q2', 600);
    expect(machine.activity.endsAt).toBe(Date.now() + 600_000);
  });

  it('不存在的題目回 QUESTION_NOT_FOUND', () => {
    expectAppError(() => machine.open('Q999', 60), 'QUESTION_NOT_FOUND');
  });

  it('非 ANSWERING 時不能手動結束或時間到', () => {
    expectAppError(() => machine.manualClose(), 'INVALID_TRANSITION');
    expectAppError(() => machine.timeUp(), 'INVALID_TRANSITION');
  });

  it('非 CLOSED 時不能下一題', () => {
    expectAppError(() => machine.next(), 'INVALID_TRANSITION');
  });

  it('作答中結束活動會先結束題目（ACTIVITY_ENDED），再進入 ENDED', () => {
    machine.open('Q1', 60);
    machine.end();
    expect(closed).toEqual([{ questionId: 'Q1', reason: 'ACTIVITY_ENDED' }]);
    expect(machine.activity).toMatchObject({ phase: 'ENDED', currentQuestionId: null, endsAt: null });
  });

  it('ENDED 後除了 reset，所有操作都回 ACTIVITY_ENDED', () => {
    machine.end();
    expectAppError(() => machine.end(), 'ACTIVITY_ENDED');
    expectAppError(() => machine.open('Q1', 60), 'ACTIVITY_ENDED');
    expectAppError(() => machine.next(), 'ACTIVITY_ENDED');
    expectAppError(() => machine.manualClose(), 'ACTIVITY_ENDED');
  });

  it('reset 可以從 ENDED 回到 WAITING', () => {
    machine.end();
    machine.reset();
    expect(machine.activity).toMatchObject({ phase: 'WAITING', currentQuestionId: null });
  });

  it('啟動恢復：資料庫中為 ANSWERING 時改回 WAITING', () => {
    machine.open('Q1', 60);
    machine.dispose();
    const restarted = new ActivityStateMachine(repo);
    expect(restarted.recoverAfterRestart()).toBe(true);
    expect(restarted.activity).toMatchObject({ phase: 'WAITING', currentQuestionId: null, endsAt: null });
    expect(repo.getCurrentActivity()?.phase).toBe('WAITING');
    restarted.dispose();
  });

  it('啟動恢復：CLOSED 時保持不變', () => {
    machine.open('Q1', 60);
    machine.manualClose();
    const restarted = new ActivityStateMachine(repo);
    expect(restarted.recoverAfterRestart()).toBe(false);
    expect(restarted.activity).toMatchObject({ phase: 'CLOSED', currentQuestionId: 'Q1' });
    restarted.dispose();
  });
});
