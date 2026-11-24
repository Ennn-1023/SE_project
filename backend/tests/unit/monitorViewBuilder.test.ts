import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../../src/data/db';
import { createMockActivity } from '../../src/data/mock/seed';
import { Repository } from '../../src/data/repositories';
import { ActivityStateMachine } from '../../src/domain/activityStateMachine';
import { ResultService } from '../../src/domain/resultService';
import { SubmissionService } from '../../src/domain/submissionService';
import type { Student } from '../../src/domain/buzzerTypes';
import { MonitorViewBuilder } from '../../src/services/monitorViewBuilder';

/** 在 users 建立虛構學生並分組（組數 4） */
function seedStudents(db: ReturnType<typeof openDb>) {
  db.prepare(`UPDATE group_settings SET group_count = 4 WHERE id = 1`).run();
  const ins = db.prepare(
    `INSERT INTO users (account, display_name, role, password_hash, using_default_password, group_number, created_at, updated_at)
     VALUES (?, ?, 'STUDENT', 'x', 1, ?, 't', 't')`,
  );
  ins.run('S101', '王小明', 1);
  ins.run('S201', '陳大文', 2);
  ins.run('S301', '林美玲', 3);
  ins.run('S302', '組員二', 3);
}

const student = (studentId: string, teamId: string, name = studentId): Student => ({ studentId, name, teamId });

describe('MonitorViewBuilder（004 US3、FR-015～FR-019）', () => {
  let repo: Repository;
  let machine: ActivityStateMachine;
  let submissions: SubmissionService;
  let builder: MonitorViewBuilder;
  let online: Set<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T02:00:00.000Z'));
    const db = openDb(':memory:');
    seedStudents(db);
    repo = new Repository(db);
    machine = new ActivityStateMachine(repo);
    submissions = new SubmissionService(machine);
    const results = new ResultService(repo);
    machine.hooks.onQuestionOpened = (q, round) => {
      submissions.startQuestion(q.questionId, round, [{ partIndex: 0, partLabel: null }]);
      repo.saveParticipants(
        [...repo.memberCounts()]
          .filter(([, n]) => n > 0)
          .map(([teamId, memberCount]) => ({
            activityId: q.activityId,
            questionId: q.questionId,
            round,
            teamId,
            teamName: '',
            memberCount,
          })),
      );
    };
    machine.hooks.onQuestionClosed = (questionId, round, reason) =>
      results.finalize(machine.activity!.id, questionId, round, submissions.all(), reason);
    online = new Set();
    builder = new MonitorViewBuilder({
      machine,
      repo,
      submissions,
      questionSet: () => ({ questionCount: 3, sourceTitle: '測試' }),
      online: () => online,
    });
    machine.start(createMockActivity(repo));
  });

  afterEach(() => {
    machine.dispose();
    vi.useRealTimers();
  });

  it('作答中：已送出依 rank、未送出依組號；elapsedSeconds 精確到 0.1；分母只計參與組別', () => {
    machine.open('Q1', 60);
    vi.advanceTimersByTime(3_240);
    submissions.submit(student('S201', 'T2'), 'Q1', ['B 的答案']);
    vi.advanceTimersByTime(1_000);
    submissions.submit(student('S101', 'T1'), 'Q1', ['A 的答案']);
    online.add('S301');
    online.add('S302');

    const view = builder.build();
    expect(view.phase).toBe('ANSWERING');
    expect(view.monitor).toMatchObject({ submittedCount: 2, teamCount: 3, allSubmitted: false, round: 1 });
    expect(view.monitor!.teams.map((r) => [r.teamId, r.rank, r.elapsedSeconds])).toEqual([
      ['T2', 1, 3.2],
      ['T1', 2, 4.2],
      ['T3', null, null],
    ]);
    expect(view.monitor!.teams[0]).toMatchObject({
      submitterName: '陳大文',
      answers: [{ partIndex: 0, partLabel: null, answer: 'B 的答案' }],
    });
    expect(view.monitor!.teams[2]).toMatchObject({ online: 2, members: 2, submitted: false });
    expect(view.result).toBeNull();
  });

  it('所有參與組別都送出時 allSubmitted 為 true（FR-017）', () => {
    machine.open('Q1', 60);
    for (const [s, team] of [['S101', 'T1'], ['S201', 'T2'], ['S301', 'T3']] as const) {
      submissions.submit(student(s, team), 'Q1', ['答案']);
    }
    expect(builder.build().monitor?.allSubmitted).toBe(true);
  });

  it('已結束：result 依順位、未送出在後；題目清單顯示搶答成功組別與進度；預選下一題', () => {
    machine.open('Q1', 60);
    submissions.submit(student('S201', 'T2'), 'Q1', ['B']);
    machine.manualClose();
    const view = builder.build();
    expect(view.phase).toBe('CLOSED');
    expect(view.result).toMatchObject({ closedReason: 'MANUAL', noSubmission: false, round: 1 });
    expect(view.result!.rows.map((r) => [r.teamId, r.rank])).toEqual([
      ['T2', 1],
      ['T1', null],
      ['T3', null],
    ]);
    expect(view.questions[0]).toMatchObject({ status: 'CLOSED', winnerTeamName: '第 2 組' });
    expect(view.progress).toEqual({ closed: 1, total: 3 });
    expect(view.preselectedQuestionId).toBe('Q2');
  });

  it('無人送出：noSubmission，清單顯示 winnerTeamName 為 null', () => {
    machine.open('Q2', 60);
    machine.manualClose();
    const view = builder.build();
    expect(view.result).toMatchObject({ noSubmission: true });
    expect(view.questions[1]).toMatchObject({ status: 'CLOSED', winnerTeamName: null });
  });

  it('預選：從最近結束的題目往後找，找不到則從頭；全部結束為 null', () => {
    machine.open('Q3', 60);
    machine.manualClose();
    expect(builder.build().preselectedQuestionId).toBe('Q1');
    machine.backToWaiting();
    expect(builder.build().preselectedQuestionId).toBe('Q1');
    for (const q of ['Q1', 'Q2']) {
      machine.open(q, 60);
      machine.manualClose();
    }
    expect(builder.build().preselectedQuestionId).toBeNull();
  });

  it('NONE／ENDED 時提供 readiness（題目集與各組人數、在線）', () => {
    online.add('S101');
    machine.end();
    const view = builder.build();
    expect(view.readiness).toEqual({
      questionCount: 3,
      sourceTitle: '測試',
      teams: [
        { teamId: 'T1', name: '第 1 組', members: 1, online: 1 },
        { teamId: 'T2', name: '第 2 組', members: 1, online: 0 },
        { teamId: 'T3', name: '第 3 組', members: 2, online: 0 },
        { teamId: 'T4', name: '第 4 組', members: 0, online: 0 },
      ],
    });
  });

  it('buildResult：未結束題目 QUESTION_NOT_CLOSED、未知題目 QUESTION_NOT_FOUND', () => {
    expect(() => builder.buildResult('Q1')).toThrow(expect.objectContaining({ code: 'QUESTION_NOT_CLOSED' }));
    expect(() => builder.buildResult('Q999')).toThrow(expect.objectContaining({ code: 'QUESTION_NOT_FOUND' }));
  });
});
