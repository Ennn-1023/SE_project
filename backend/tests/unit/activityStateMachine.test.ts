import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../../src/data/db';
import { Repository } from '../../src/data/repositories';
import { createMockActivity } from '../../src/data/mock/seed';
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
  let closed: Array<{ questionId: string; round: number; reason: string }>;
  let opened: Array<{ questionId: string; round: number }>;
  let changes: number;

  /** 模擬 ResultService：結束時寫入一筆結果（讓重開與重啟還原可測） */
  const finalize = (questionId: string, round: number, reason: string) =>
    repo.saveQuestionOutcome([], {
      activityId: machine.activity!.id,
      questionId,
      answer: null,
      winnerTeam: null,
      submittedAt: null,
      round,
      voided: false,
      closedReason: reason as 'TIME_UP',
      closedAt: Date.now(),
      answers: [],
    });

  const attach = (m: ActivityStateMachine) => {
    m.hooks.onQuestionOpened = (q, round) => opened.push({ questionId: q.questionId, round });
    m.hooks.onQuestionClosed = (questionId, round, reason) => {
      closed.push({ questionId, round, reason });
      finalize(questionId, round, reason);
    };
    m.hooks.onChange = () => changes++;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T02:00:00.000Z'));
    repo = new Repository(openDb(':memory:'));
    machine = new ActivityStateMachine(repo);
    closed = [];
    opened = [];
    changes = 0;
    attach(machine);
    machine.start(createMockActivity(repo));
    changes = 0;
  });

  afterEach(() => {
    machine.dispose();
    vi.useRealTimers();
  });

  describe('無活動（004 T006）', () => {
    it('從未開始過活動時 activity 為 null、status 為 NONE，各操作回 NO_ACTIVITY', () => {
      const empty = new ActivityStateMachine(new Repository(openDb(':memory:')));
      expect(empty.activity).toBeNull();
      expect(empty.status()).toEqual({ phase: 'NONE', currentQuestionId: null, endsAt: null });
      for (const op of [
        () => empty.open('Q1', 60),
        () => empty.manualClose(),
        () => empty.backToWaiting(),
        () => empty.end(),
        () => empty.reset(),
      ]) {
        expectAppError(op, 'NO_ACTIVITY');
      }
    });

    it('start 進入 WAITING；已有未結束活動時回 ACTIVITY_ALREADY_RUNNING', () => {
      expect(machine.activity).toMatchObject({ id: 'A1', phase: 'WAITING' });
      expectAppError(() => machine.start(createMockActivity(repo)), 'ACTIVITY_ALREADY_RUNNING');
    });

    it('上一場結束後可以開始新活動', () => {
      machine.end();
      const next = createMockActivity(repo);
      machine.start(next);
      expect(machine.activity).toMatchObject({ id: next.id, phase: 'WAITING' });
    });
  });

  it('正常流程：開放 → 時間到自動結束 → 回到等待 → 結束活動', () => {
    machine.open('Q1', 60);
    expect(machine.activity).toMatchObject({
      phase: 'ANSWERING',
      currentQuestionId: 'Q1',
      openedAt: Date.parse('2026-11-20T02:00:00.000Z'),
      endsAt: Date.parse('2026-11-20T02:01:00.000Z'),
    });
    expect(repo.getQuestion('Q1')).toMatchObject({ status: 'ANSWERING', currentRound: 1, seconds: 60 });

    vi.advanceTimersByTime(59_999);
    expect(machine.activity!.phase).toBe('ANSWERING');
    vi.advanceTimersByTime(1);
    expect(machine.activity).toMatchObject({ phase: 'CLOSED', currentQuestionId: 'Q1', endsAt: null });
    expect(closed).toEqual([{ questionId: 'Q1', round: 1, reason: 'TIME_UP' }]);
    expect(repo.getQuestion('Q1')).toMatchObject({ status: 'CLOSED', closedReason: 'TIME_UP' });

    machine.backToWaiting();
    expect(machine.activity).toMatchObject({ phase: 'WAITING', currentQuestionId: null });

    machine.end();
    expect(machine.activity!.phase).toBe('ENDED');
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
    expect(machine.activity!.endsAt).toBe(Date.now() + 60_000);
  });

  it('時間到與手動結束同時觸發，只結束一次', () => {
    machine.open('Q1', 5);
    vi.advanceTimersByTime(5_000);
    expect(machine.closeQuestion('MANUAL')).toBe(false);
    machine.manualClose(); // 已結束：無變化，不拋錯（US2-5）
    expect(closed).toHaveLength(1);
    expect(closed[0]?.reason).toBe('TIME_UP');
  });

  it('時間到與手動結束同時觸發 100 次，每次只產生 1 筆結果（SC-004）', () => {
    for (let i = 0; i < 100; i++) {
      const fresh = new Repository(openDb(':memory:'));
      const m = new ActivityStateMachine(fresh);
      let count = 0;
      m.hooks.onQuestionClosed = () => count++;
      m.start(createMockActivity(fresh));
      m.open('Q1', 5);
      vi.advanceTimersByTime(5_000);
      m.manualClose();
      m.closeQuestion('MANUAL');
      expect(count).toBe(1);
      m.dispose();
    }
  });

  it('手動結束後，原本的計時器不會再觸發', () => {
    machine.open('Q1', 10);
    machine.manualClose();
    vi.advanceTimersByTime(20_000);
    expect(closed).toEqual([{ questionId: 'Q1', round: 1, reason: 'MANUAL' }]);
  });

  it('作答中再開放另一題被拒並指出作答中的題目，階段不變', () => {
    machine.open('Q1', 60);
    try {
      machine.open('Q2', 60);
      throw new Error('預期拋出');
    } catch (e) {
      expect((e as AppError).code).toBe('INVALID_TRANSITION');
      expect((e as AppError).params).toMatchObject({ message: '目前第 1 題作答中' });
    }
    expect(machine.activity).toMatchObject({ phase: 'ANSWERING', currentQuestionId: 'Q1' });
  });

  it('作答中重複開放同一題為無變化（FR-014）', () => {
    machine.open('Q1', 60);
    const endsAt = machine.activity!.endsAt;
    vi.advanceTimersByTime(3_000);
    machine.open('Q1', 60);
    expect(machine.activity!.endsAt).toBe(endsAt);
    expect(opened).toHaveLength(1);
  });

  it.each([0, 4, 601, 1.5, Number.NaN, '60', 'abc', null])('秒數 %s 回 INVALID_SECONDS', (s) => {
    expectAppError(() => machine.open('Q1', s as unknown as number), 'INVALID_SECONDS');
    expect(machine.activity!.phase).toBe('WAITING');
  });

  it('秒數邊界 5 與 600 可以開放', () => {
    machine.open('Q1', 5);
    machine.manualClose();
    machine.open('Q2', 600);
    expect(machine.activity!.endsAt).toBe(Date.now() + 600_000);
  });

  it('不存在的題目回 QUESTION_NOT_FOUND', () => {
    expectAppError(() => machine.open('Q999', 60), 'QUESTION_NOT_FOUND');
  });

  it('WAITING 時不能手動結束或時間到', () => {
    expectAppError(() => machine.manualClose(), 'INVALID_TRANSITION');
    expectAppError(() => machine.timeUp(), 'INVALID_TRANSITION');
  });

  describe('結束後直接開放下一題與回到等待（research.md R4）', () => {
    it('CLOSED 時可直接開放下一題', () => {
      machine.open('Q1', 60);
      machine.manualClose();
      machine.open('Q2', 30);
      expect(machine.activity).toMatchObject({ phase: 'ANSWERING', currentQuestionId: 'Q2' });
    });

    it('已結束的題目不能用 open 再開放（QUESTION_ALREADY_CLOSED）', () => {
      machine.open('Q1', 60);
      machine.manualClose();
      expectAppError(() => machine.open('Q1', 60), 'QUESTION_ALREADY_CLOSED');
    });

    it('backToWaiting：CLOSED → WAITING；WAITING 時無變化；ANSWERING 時拒絕', () => {
      machine.backToWaiting();
      expect(changes).toBe(0);
      machine.open('Q1', 60);
      expectAppError(() => machine.backToWaiting(), 'INVALID_TRANSITION');
      machine.manualClose();
      machine.backToWaiting();
      expect(machine.activity!.phase).toBe('WAITING');
    });
  });

  describe('重新開放（FR-007a）', () => {
    it('只有已結束的題目可以重開，輪次遞增', () => {
      expectAppError(() => machine.reopen('Q1', 60), 'QUESTION_NOT_CLOSED');
      machine.open('Q1', 60);
      machine.manualClose();
      machine.reopen('Q1', 30);
      expect(repo.getQuestion('Q1')).toMatchObject({ status: 'ANSWERING', currentRound: 2, seconds: 30 });
      expect(opened).toEqual([
        { questionId: 'Q1', round: 1 },
        { questionId: 'Q1', round: 2 },
      ]);
      // 重開中重複送出同一題為無變化
      machine.reopen('Q1', 30);
      expect(opened).toHaveLength(2);
    });
  });

  it('作答中結束活動會先結束題目（ACTIVITY_ENDED），再進入 ENDED', () => {
    machine.open('Q1', 60);
    machine.end();
    expect(closed).toEqual([{ questionId: 'Q1', round: 1, reason: 'ACTIVITY_ENDED' }]);
    expect(machine.activity).toMatchObject({ phase: 'ENDED', currentQuestionId: null, endsAt: null });
  });

  it('ENDED 後再結束為無變化，其餘操作回 ACTIVITY_ENDED', () => {
    machine.end();
    const before = changes;
    machine.end();
    expect(changes).toBe(before);
    expectAppError(() => machine.open('Q1', 60), 'ACTIVITY_ENDED');
    expectAppError(() => machine.backToWaiting(), 'ACTIVITY_ENDED');
    expectAppError(() => machine.manualClose(), 'ACTIVITY_ENDED');
  });

  it('reset 可以從 ENDED 回到 WAITING，題目回到未開放', () => {
    machine.open('Q1', 60);
    machine.manualClose();
    machine.end();
    machine.reset();
    expect(machine.activity).toMatchObject({ phase: 'WAITING', currentQuestionId: null });
    expect(repo.getQuestion('Q1')).toMatchObject({ status: 'NOT_OPENED', currentRound: 0 });
  });

  describe('啟動恢復（FR-026、research.md R5）', () => {
    it('作答中重啟：回到 WAITING、題目回到未開放並回傳提示', () => {
      machine.open('Q1', 60);
      machine.dispose();
      const restarted = new ActivityStateMachine(repo);
      expect(restarted.recoverAfterRestart()).toBe('伺服器重新啟動，第 1 題作答已取消，可重新開放');
      expect(restarted.activity).toMatchObject({
        phase: 'WAITING',
        currentQuestionId: null,
        endsAt: null,
        notice: '伺服器重新啟動，第 1 題作答已取消，可重新開放',
      });
      expect(repo.getQuestion('Q1')).toMatchObject({ status: 'NOT_OPENED', currentRound: 0 });
      restarted.dispose();
    });

    it('重開中重啟：恢復為原有效結果（CLOSED、輪次減 1）', () => {
      machine.open('Q1', 60);
      machine.manualClose();
      machine.reopen('Q1', 60);
      machine.dispose();
      const restarted = new ActivityStateMachine(repo);
      expect(restarted.recoverAfterRestart()).toBe(
        '伺服器重新啟動，第 1 題重新作答已取消，保留原結果',
      );
      expect(repo.getQuestion('Q1')).toMatchObject({ status: 'CLOSED', currentRound: 1, closedReason: 'MANUAL' });
      expect(repo.getResult('A1', 'Q1')).toMatchObject({ round: 1, voided: false });
      restarted.dispose();
    });

    it('CLOSED 時保持不變', () => {
      machine.open('Q1', 60);
      machine.manualClose();
      const restarted = new ActivityStateMachine(repo);
      expect(restarted.recoverAfterRestart()).toBeNull();
      expect(restarted.activity).toMatchObject({ phase: 'CLOSED', currentQuestionId: 'Q1' });
      restarted.dispose();
    });

    it('clearNotice 清除提示', () => {
      machine.open('Q1', 60);
      const restarted = new ActivityStateMachine(repo);
      restarted.recoverAfterRestart();
      restarted.clearNotice();
      expect(repo.getCurrentActivity()?.notice).toBeNull();
      restarted.dispose();
    });
  });
});
