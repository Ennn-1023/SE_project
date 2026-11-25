/** ActivityResultReader（005 data-model.md §2、FR-001、FR-002、FR-019）。資料皆為虛構。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/data/db';
import { Repository, type NewActivityQuestion } from '../../src/data/repositories';
import type { Activity, ActivityQuestion, Submission } from '../../src/domain/buzzerTypes';
import { ActivityResultReader } from '../../src/services/activityResultReader';

let db: Db;
let repo: Repository;
let reader: ActivityResultReader;

const activity = (id: string, startedAt: number | null): Activity => ({
  id,
  phase: 'ENDED',
  currentQuestionId: null,
  openedAt: null,
  endsAt: null,
  startedAt,
  startedBy: startedAt === null ? null : 1,
  endedAt: null,
  sourceTitle: null,
  notice: null,
  source: null,
});

const single = (id: string, pos: number, cell: string): NewActivityQuestion => ({
  questionId: id,
  position: pos,
  label: String(pos),
  text: `題目 ${pos}`,
  questionKey: `qk0${pos}`,
  kind: 'SINGLE',
  stem: null,
  parts: [{ partIndex: 0, partLabel: null, questionText: `題目 ${pos}`, answerCell: cell }],
});

function setState(id: string, patch: Partial<ActivityQuestion>) {
  repo.updateQuestionState({ ...repo.getQuestion(id)!, ...patch });
}

function closeRound(
  aid: string,
  qid: string,
  round: number,
  openedAt: number,
  subs: { team: string; rank: number; at: number; answers: string[] }[],
) {
  repo.saveParticipants(
    ['T1', 'T2', 'T3'].map((teamId) => ({
      activityId: aid,
      questionId: qid,
      round,
      teamId,
      teamName: '',
      memberCount: 1,
    })),
  );
  const submissions: Submission[] = subs.map((s) => ({
    activityId: aid,
    questionId: qid,
    teamId: s.team,
    studentId: `S${s.team}`,
    answer: s.answers.join(' / '),
    answers: s.answers.map((answer, partIndex) => ({ partIndex, partLabel: null, answer })),
    round,
    voided: false,
    receivedAt: s.at,
    rank: s.rank,
  }));
  const win = submissions.find((s) => s.rank === 1) ?? null;
  repo.saveQuestionOutcome(submissions, {
    activityId: aid,
    questionId: qid,
    answer: win?.answer ?? null,
    winnerTeam: win?.teamId ?? null,
    submittedAt: win?.receivedAt ?? null,
    round,
    voided: false,
    closedReason: 'MANUAL',
    closedAt: openedAt + 60_000,
    answers: win?.answers ?? [],
  });
  setState(qid, {
    status: 'CLOSED',
    currentRound: round,
    openedAt,
    closedAt: openedAt + 60_000,
    closedReason: 'MANUAL',
  });
}

beforeEach(() => {
  db = openDb(':memory:');
  repo = new Repository(db);
  reader = new ActivityResultReader(repo);
});

describe('latestActivity（FR-001）', () => {
  it('從未有活動時為 null（邊界）', () => {
    expect(reader.latestActivity()).toBeNull();
  });

  it('取最近開始的活動，排除 started_at 為 NULL 的 mock 活動（正常）', () => {
    repo.createActivity(activity('ACT-OLD', 1000), []);
    repo.createActivity(activity('ACT-NEW', 2000), []);
    repo.createActivity(activity('A1', null), []);
    expect(reader.latestActivity()?.id).toBe('ACT-NEW');
  });
});

describe('validResults（FR-002、FR-019）', () => {
  const A = 'ACT-R';
  beforeEach(() => {
    repo.createActivity(activity(A, 1000), [
      single(`${A}-1`, 1, 'G5'),
      {
        questionId: `${A}-2`,
        position: 2,
        label: '2',
        text: '題組',
        questionKey: 'qk02',
        kind: 'GROUP',
        stem: '題幹',
        parts: [
          { partIndex: 0, partLabel: '（1）', questionText: '小題一', answerCell: 'H10' },
          { partIndex: 1, partLabel: '（2）', questionText: '小題二', answerCell: 'H11' },
        ],
      },
      single(`${A}-3`, 3, 'G15'),
      single(`${A}-4`, 4, 'G20'),
    ]);
    // 第 1 題：第 2 組最快、第 1 組次之、第 3 組未送出
    closeRound(A, `${A}-1`, 1, 10_000, [
      { team: 'T2', rank: 1, at: 13_200, answers: ['光合作用'] },
      { team: 'T1', rank: 2, at: 15_000, answers: ['呼吸作用'] },
    ]);
    // 第 2 題：第 1 輪第 1 組成功，重新開放後第 3 組成功（第 1 輪作廢）
    closeRound(A, `${A}-2`, 1, 20_000, [
      { team: 'T1', rank: 1, at: 21_000, answers: ['舊一', '舊二'] },
    ]);
    closeRound(A, `${A}-2`, 2, 30_000, [
      { team: 'T3', rank: 1, at: 34_500, answers: ['新一', '新二'] },
    ]);
    // 第 3 題：第 1 輪已結束，重新開放後作答中
    closeRound(A, `${A}-3`, 1, 40_000, [{ team: 'T2', rank: 1, at: 41_000, answers: ['舊答案'] }]);
    setState(`${A}-3`, { status: 'ANSWERING', currentRound: 2, openedAt: 50_000 });
  });

  it('已結束題目帶參與組別、依順位的送出與成功組別；後備位置來自題目快照（正常）', () => {
    const [q1] = reader.validResults(A);
    expect(q1).toMatchObject({
      questionKey: 'qk01',
      status: 'CLOSED',
      round: 1,
      openedAt: 10_000,
      parts: [{ partIndex: 0, partLabel: null, fallbackCell: 'G5' }],
      winner: {
        teamId: 'T2',
        teamName: '第 2 組',
        answers: [{ partIndex: 0, answer: '光合作用' }],
      },
    });
    expect(q1!.teams.map((t) => t.teamName)).toEqual(['第 1 組', '第 2 組', '第 3 組']);
    expect(q1!.submissions.map((s) => [s.teamId, s.rank, s.receivedAt])).toEqual([
      ['T2', 1, 13_200],
      ['T1', 2, 15_000],
    ]);
  });

  it('重新開放後只用新一輪，作廢輪次不出現（FR-019）', () => {
    const q2 = reader.validResults(A)[1]!;
    expect(q2.round).toBe(2);
    expect(q2.winner).toMatchObject({
      teamId: 'T3',
      answers: [{ answer: '新一' }, { answer: '新二' }],
    });
    expect(q2.submissions.map((s) => s.teamId)).toEqual(['T3']);
    expect(JSON.stringify(q2)).not.toContain('舊一');
    expect(q2.parts.map((p) => p.fallbackCell)).toEqual(['H10', 'H11']);
  });

  it('作答中（含重新開放後）與未開放題目不帶任何送出（FR-002，邊界）', () => {
    const [, , q3, q4] = reader.validResults(A);
    expect(q3).toMatchObject({ status: 'ANSWERING', teams: [], submissions: [], winner: null });
    expect(JSON.stringify(q3)).not.toContain('舊答案');
    expect(q4).toMatchObject({ status: 'NOT_OPENED', teams: [], submissions: [], winner: null });
  });

  it('不讀出送出者學號或姓名（Clarifications Q4）', () => {
    expect(JSON.stringify(reader.validResults(A))).not.toMatch(/ST[123]|studentId/);
  });
});
