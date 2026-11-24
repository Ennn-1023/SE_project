import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type {
  MonitorTeamRow,
  QuestionListItem,
  ResultBoardView,
  TeacherActivityView,
} from '@buzzer/shared';
import type { ConnectionStatus, TeacherSocket } from '../src/realtime/socket';

/** 可由測試手動推播的假老師 socket */
export function createFakeTeacherSocket() {
  let viewCb: ((v: TeacherActivityView) => void) | null = null;
  let connCb: ((s: ConnectionStatus, reason?: string) => void) | null = null;
  const socket: TeacherSocket = {
    onView(cb) {
      viewCb = cb;
      return () => (viewCb = null);
    },
    onConnectionChange(cb) {
      connCb = cb;
      return () => (connCb = null);
    },
    disconnect: vi.fn(),
  };
  return {
    factory: () => socket,
    push(v: TeacherActivityView) {
      act(() => viewCb?.(v));
    },
    connection(s: ConnectionStatus, reason?: string) {
      act(() => connCb?.(s, reason));
    },
  };
}

let clock = Date.parse('2026-11-24T02:00:00.000Z');
/** 每次呼叫都比上一次晚 1 毫秒，避免「較舊視圖被忽略」 */
export const serverNow = () => new Date((clock += 1)).toISOString();

export function listItem(n: number, over: Partial<QuestionListItem> = {}): QuestionListItem {
  const group = n === 2;
  return {
    questionId: `ACT-1-${n}`,
    label: String(n),
    position: n,
    kind: group ? 'GROUP' : 'SINGLE',
    summary: group ? '閱讀下列敘述後回答。' : `第 ${n} 題的題目文字`,
    status: 'NOT_OPENED',
    round: 0,
    winnerTeamName: null,
    stem: group ? '閱讀下列敘述後回答。' : null,
    parts: group
      ? [
          { partIndex: 0, partLabel: '（1）', text: '小題一的題目' },
          { partIndex: 1, partLabel: '（2）', text: '小題二的題目' },
        ]
      : [{ partIndex: 0, partLabel: null, text: `第 ${n} 題的題目文字` }],
    ...over,
  };
}

export const readiness = (over: Partial<NonNullable<TeacherActivityView['readiness']>> = {}) => ({
  questionCount: 3,
  sourceTitle: '測試學習單／學習單',
  teams: [
    { teamId: 'T1', name: '第 1 組', members: 2, online: 1 },
    { teamId: 'T2', name: '第 2 組', members: 1, online: 0 },
  ],
  ...over,
});

export function teacherView(over: Partial<TeacherActivityView> = {}): TeacherActivityView {
  return {
    phase: 'WAITING',
    serverNow: serverNow(),
    activity: { id: 'ACT-1', sourceTitle: '測試學習單／學習單', startedAt: serverNow() },
    readiness: null,
    questions: [listItem(1), listItem(2), listItem(3)],
    progress: { closed: 0, total: 3 },
    current: null,
    endsAt: null,
    monitor: null,
    result: null,
    preselectedQuestionId: 'ACT-1-1',
    notice: null,
    ...over,
  };
}

export const noneView = (over: Partial<TeacherActivityView> = {}) =>
  teacherView({
    phase: 'NONE',
    activity: null,
    readiness: readiness(),
    questions: [],
    progress: { closed: 0, total: 0 },
    preselectedQuestionId: null,
    ...over,
  });

export function row(teamId: string, over: Partial<MonitorTeamRow> = {}): MonitorTeamRow {
  const n = Number(teamId.slice(1));
  return {
    teamId,
    teamName: `第 ${n} 組`,
    submitted: false,
    rank: null,
    elapsedSeconds: null,
    submitterName: null,
    answers: null,
    online: 1,
    members: 1,
    ...over,
  };
}

export const submitted = (teamId: string, rank: number, answer: string, elapsed = 3.2) =>
  row(teamId, {
    submitted: true,
    rank,
    elapsedSeconds: elapsed,
    submitterName: `學生${teamId}`,
    answers: [{ partIndex: 0, partLabel: null, answer }],
  });

export const detail = (n: number) => {
  const { questionId, label, kind, stem, parts } = listItem(n);
  return { questionId, label, kind, stem, parts };
};

export function resultView(over: Partial<ResultBoardView> = {}): ResultBoardView {
  return {
    question: detail(1),
    round: 1,
    closedReason: 'MANUAL',
    rows: [submitted('T2', 1, 'B 的答案'), submitted('T1', 2, 'A 的答案', 5.5), row('T3')],
    noSubmission: false,
    ...over,
  };
}
