import { describe, expect, it } from 'vitest';
import { buildView } from '../../src/domain/visibilityFilter';
import type { Activity, ActivityQuestion, QuestionPart, Submission, Team } from '../../src/domain/buzzerTypes';

const NOW = Date.parse('2026-11-20T02:00:20.000Z');
const question: ActivityQuestion = {
  questionId: 'Q1',
  activityId: 'A1',
  number: 1,
  position: 1,
  text: '題目一',
  label: '1',
  questionKey: null,
  kind: 'SINGLE',
  stem: null,
  status: 'ANSWERING',
  currentRound: 1,
  seconds: 60,
  openedAt: null,
  closedAt: null,
  closedReason: null,
};
const parts: QuestionPart[] = [{ partIndex: 0, partLabel: null, questionText: '題目一' }];
const base = { openedAt: null, startedAt: null, startedBy: null, endedAt: null, sourceTitle: null, notice: null };
const teams: Team[] = [
  { teamId: 'T1', activityId: 'A1', name: '第 1 組' },
  { teamId: 'T2', activityId: 'A1', name: '第 2 組' },
  { teamId: 'T3', activityId: 'A1', name: '第 3 組' },
];
const sub = (teamId: string, rank: number, answer: string): Submission => ({
  activityId: 'A1',
  questionId: 'Q1',
  teamId,
  studentId: `S-${teamId}`,
  answer,
  answers: [{ partIndex: 0, partLabel: null, answer }],
  round: 1,
  voided: false,
  receivedAt: NOW - 10_000 + rank,
  rank,
});
const submissions = [sub('T2', 1, '第二組的秘密答案'), sub('T1', 2, '第一組的答案')];
const answering: Activity = {
  ...base,
  id: 'A1',
  phase: 'ANSWERING',
  currentQuestionId: 'Q1',
  endsAt: Date.parse('2026-11-20T02:01:00.000Z'),
};

describe('buildView 隔離不變式（FR-015、SC-004）', () => {
  it('ANSWERING 時只包含本組的送出，序列化後不含他組任何資料', () => {
    const view = buildView({ activity: answering, question, parts, myTeam: teams[0]!, teams, submissions, now: NOW });
    expect(view).toEqual({
      phase: 'ANSWERING',
      serverNow: '2026-11-20T02:00:20.000Z',
      myTeam: { teamId: 'T1', name: '第 1 組' },
      question: { questionId: 'Q1', number: 1, text: '題目一', label: '1', kind: 'SINGLE', stem: null, parts: [{ partIndex: 0, partLabel: null, text: '題目一' }] },
      endsAt: '2026-11-20T02:01:00.000Z',
      myTeamSubmission: { answer: '第一組的答案', answers: [{ partIndex: 0, partLabel: null, answer: '第一組的答案' }] },
    });
    const json = JSON.stringify(view);
    for (const leak of ['T2', '第 2 組', '第二組的秘密答案', 'T3', 'rank', 'S-T1']) {
      expect(json).not.toContain(leak);
    }
  });

  it('ANSWERING 時本組尚未送出，myTeamSubmission 為 null', () => {
    const view = buildView({ activity: answering, question, parts, myTeam: teams[2]!, teams, submissions, now: NOW });
    expect(view.myTeamSubmission).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/第二組|第一組|T1|T2/);
  });

  it('未分組學生在 ANSWERING 時看不到任何送出', () => {
    const view = buildView({ activity: answering, question, parts, myTeam: null, teams, submissions, now: NOW });
    expect(view.myTeam).toBeNull();
    expect(view.myTeamSubmission).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/第二組|第一組/);
  });

  it('WAITING 時不含題目、倒數或送出', () => {
    const view = buildView({
      activity: { ...base, id: 'A1', phase: 'WAITING', currentQuestionId: null, endsAt: null },
      question: null,
      parts: [],
      myTeam: teams[0]!,
      teams,
      submissions,
      now: NOW,
    });
    expect(view).toEqual({ phase: 'WAITING', serverNow: '2026-11-20T02:00:20.000Z', myTeam: { teamId: 'T1', name: '第 1 組' } });
  });
});
