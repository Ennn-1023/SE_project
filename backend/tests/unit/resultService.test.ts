import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/data/db';
import { Repository } from '../../src/data/repositories';
import { createMockActivity } from '../../src/data/mock/seed';
import { ResultService } from '../../src/domain/resultService';
import type { Submission } from '../../src/domain/buzzerTypes';

const sub = (teamId: string, studentId: string, rank: number, answer: string, receivedAt: number): Submission => ({
  activityId: 'A1',
  questionId: 'Q1',
  teamId,
  studentId,
  answer,
  answers: [{ partIndex: 0, partLabel: null, answer }],
  round: 1,
  voided: false,
  receivedAt,
  rank,
});

describe('ResultService.finalize（FR-019、FR-020）', () => {
  let repo: Repository;
  let svc: ResultService;

  beforeEach(() => {
    repo = new Repository(openDb(':memory:'));
    createMockActivity(repo);
    svc = new ResultService(repo);
  });

  it('rank 1 成為結果，所有送出紀錄一起寫入', () => {
    const subs = [sub('T2', 'S201', 1, 'B 的答案', 1000), sub('T1', 'S101', 2, 'A 的答案', 1500)];
    const result = svc.finalize('A1', 'Q1', 1, subs, 'MANUAL', 2000);
    expect(result).toEqual({
      activityId: 'A1',
      questionId: 'Q1',
      answer: 'B 的答案',
      winnerTeam: 'T2',
      submittedAt: 1000,
      round: 1,
      voided: false,
      closedReason: 'MANUAL',
      closedAt: 2000,
      answers: [{ partIndex: 0, partLabel: null, answer: 'B 的答案' }],
    });
    expect(repo.getResult('A1', 'Q1')).toEqual(result);
    expect(repo.listSubmissions('A1', 'Q1')).toEqual(subs);
  });

  it('送出順序打亂時仍以 rank 1 為成功組', () => {
    const subs = [sub('T1', 'S101', 2, 'A', 1500), sub('T3', 'S301', 1, 'C', 900)];
    expect(svc.finalize('A1', 'Q1', 1, subs, 'TIME_UP', 2000).winnerTeam).toBe('T3');
  });

  it('沒有人送出時 answer、winner_team、submitted_at 為 null', () => {
    const result = svc.finalize('A1', 'Q1', 1, [], 'TIME_UP', 2000);
    expect(result).toMatchObject({ answer: null, winnerTeam: null, submittedAt: null, closedReason: 'TIME_UP' });
    expect(repo.hasResult('A1', 'Q1')).toBe(true);
    expect(repo.listSubmissions('A1', 'Q1')).toEqual([]);
  });

  it('寫入失敗時整筆交易回復：送出紀錄與結果都不會寫入', () => {
    // 第二筆的順位與第一筆重複，違反 UNIQUE (activity_id, question_id, round, rank)
    // （整合 001 後組別來自 users.group_number，submissions.team_id 不再有外鍵）
    const subs = [sub('T1', 'S101', 1, 'A', 1000), sub('T2', 'S201', 1, 'B', 1100)];
    expect(() => svc.finalize('A1', 'Q1', 1, subs, 'MANUAL', 2000)).toThrow();
    expect(repo.hasResult('A1', 'Q1')).toBe(false);
    expect(repo.listSubmissions('A1', 'Q1')).toEqual([]);
  });

  it('同一輪不能產生兩筆結果', () => {
    svc.finalize('A1', 'Q1', 1, [], 'TIME_UP', 2000);
    expect(() => svc.finalize('A1', 'Q1', 1, [], 'MANUAL', 3000)).toThrow();
    expect(repo.listResults('A1')).toHaveLength(1);
  });

  it('新一輪結束時作廢較早輪次，只保留一筆有效結果（004 FR-007a、SC-011）', () => {
    svc.finalize('A1', 'Q1', 1, [sub('T1', 'S101', 1, '舊答案', 1000)], 'MANUAL', 2000);
    const round2 = [{ ...sub('T2', 'S201', 1, '新答案', 5000), round: 2 }];
    svc.finalize('A1', 'Q1', 2, round2, 'TIME_UP', 6000);
    expect(repo.getResult('A1', 'Q1')).toMatchObject({ round: 2, winnerTeam: 'T2', answer: '新答案' });
    expect(repo.listResults('A1')).toHaveLength(1);
    expect(repo.listSubmissions('A1', 'Q1').map((s) => s.answer)).toEqual(['新答案']);
    // 舊輪保留在紀錄中並標記作廢
    expect(repo.listAllSubmissions('A1', 'Q1').map((s) => [s.round, s.voided])).toEqual([
      [1, true],
      [2, false],
    ]);
  });
});
