import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/data/db';
import { Repository } from '../../src/data/repositories';
import { seedMockData } from '../../src/data/mock/seed';
import { ResultService } from '../../src/domain/resultService';
import type { Submission } from '../../src/domain/types';

const sub = (teamId: string, studentId: string, rank: number, answer: string, receivedAt: number): Submission => ({
  activityId: 'A1',
  questionId: 'Q1',
  teamId,
  studentId,
  answer,
  receivedAt,
  rank,
});

describe('ResultService.finalize（FR-019、FR-020）', () => {
  let repo: Repository;
  let svc: ResultService;

  beforeEach(() => {
    repo = new Repository(openDb(':memory:'));
    seedMockData(repo);
    svc = new ResultService(repo);
  });

  it('rank 1 成為結果，所有送出紀錄一起寫入', () => {
    const subs = [sub('T2', 'S201', 1, 'B 的答案', 1000), sub('T1', 'S101', 2, 'A 的答案', 1500)];
    const result = svc.finalize('A1', 'Q1', subs, 'MANUAL', 2000);
    expect(result).toEqual({
      activityId: 'A1',
      questionId: 'Q1',
      answer: 'B 的答案',
      winnerTeam: 'T2',
      submittedAt: 1000,
      closedReason: 'MANUAL',
      closedAt: 2000,
    });
    expect(repo.getResult('A1', 'Q1')).toEqual(result);
    expect(repo.listSubmissions('A1', 'Q1')).toEqual(subs);
  });

  it('送出順序打亂時仍以 rank 1 為成功組', () => {
    const subs = [sub('T1', 'S101', 2, 'A', 1500), sub('T3', 'S301', 1, 'C', 900)];
    expect(svc.finalize('A1', 'Q1', subs, 'TIME_UP', 2000).winnerTeam).toBe('T3');
  });

  it('沒有人送出時 answer、winner_team、submitted_at 為 null', () => {
    const result = svc.finalize('A1', 'Q1', [], 'TIME_UP', 2000);
    expect(result).toMatchObject({ answer: null, winnerTeam: null, submittedAt: null, closedReason: 'TIME_UP' });
    expect(repo.hasResult('A1', 'Q1')).toBe(true);
    expect(repo.listSubmissions('A1', 'Q1')).toEqual([]);
  });

  it('寫入失敗時整筆交易回復：送出紀錄與結果都不會寫入', () => {
    // 第二筆指向不存在的組別，違反外鍵限制
    const subs = [sub('T1', 'S101', 1, 'A', 1000), sub('NOPE', 'S201', 2, 'B', 1100)];
    expect(() => svc.finalize('A1', 'Q1', subs, 'MANUAL', 2000)).toThrow();
    expect(repo.hasResult('A1', 'Q1')).toBe(false);
    expect(repo.listSubmissions('A1', 'Q1')).toEqual([]);
  });

  it('同一題不能產生兩筆結果', () => {
    svc.finalize('A1', 'Q1', [], 'TIME_UP', 2000);
    expect(() => svc.finalize('A1', 'Q1', [], 'MANUAL', 3000)).toThrow();
    expect(repo.listResults('A1')).toHaveLength(1);
  });
});
