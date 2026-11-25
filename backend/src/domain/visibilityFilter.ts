import type { StudentView } from '@buzzer/shared';
import type { Activity, ActivityQuestion, QuestionPart, Submission, Team } from './buzzerTypes';

export interface ViewInput {
  /** 從未開始過任何活動時為 null（004 FR-030） */
  activity: Activity | null;
  question: ActivityQuestion | null;
  /** 目前題目的小題（題組多作答框，004 FR-030a） */
  parts: QuestionPart[];
  myTeam: Team | null;
  /** 本活動所有組別（結果揭曉時用來顯示組名） */
  teams: Team[];
  /** 目前題目的所有送出；本函式負責過濾 */
  submissions: Submission[];
  now: number;
}

/**
 * 產生學生視角（002 data-model.md StudentView；004 data-model.md §3）。
 * 隔離不變式：phase !== 'CLOSED' 時，輸出不含任何其他組別的資料（002 FR-015、004 FR-021）；
 * 任何階段都不含老師監控資料（送出時間、送出者、在線人數）。
 */
export function buildView(input: ViewInput): StudentView {
  const { activity, question, parts, myTeam, submissions, now } = input;
  const myTeamRef = myTeam ? { teamId: myTeam.teamId, name: myTeam.name } : null;
  if (!activity) {
    return { phase: 'NO_ACTIVITY', serverNow: new Date(now).toISOString(), myTeam: myTeamRef };
  }
  const view: StudentView = {
    phase: activity.phase,
    serverNow: new Date(now).toISOString(),
    myTeam: myTeamRef,
  };

  if ((activity.phase === 'ANSWERING' || activity.phase === 'CLOSED') && question) {
    view.question = {
      questionId: question.questionId,
      number: question.number,
      text: question.text,
      label: question.label,
      kind: question.kind,
      stem: question.stem,
      parts: parts.map((p) => ({ partIndex: p.partIndex, partLabel: p.partLabel, text: p.questionText })),
    };
    const mine = myTeam ? submissions.find((s) => s.teamId === myTeam.teamId) : undefined;
    view.myTeamSubmission = mine ? { answer: mine.answer, answers: mine.answers } : null;
  }

  if (activity.phase === 'ANSWERING' && activity.endsAt != null) {
    view.endsAt = new Date(activity.endsAt).toISOString();
  }

  // 只有 CLOSED 才揭曉所有組別（002 FR-016）；依 002 釐清 Q4 不含送出時間與送出者
  if (activity.phase === 'CLOSED' && question) {
    const teamName = new Map(input.teams.map((t) => [t.teamId, t.name]));
    const ordered = [...submissions].sort((a, b) => a.rank - b.rank);
    view.results = ordered.map((s) => ({
      rank: s.rank,
      teamName: teamName.get(s.teamId) ?? s.teamId,
      answer: s.answer,
      answers: s.answers,
      isWinner: s.rank === 1,
    }));
    const mine = myTeam ? ordered.find((s) => s.teamId === myTeam.teamId) : undefined;
    view.myTeamOutcome = !mine ? 'NOT_SUBMITTED' : mine.rank === 1 ? 'WIN' : 'LOSE';
  }

  return view;
}

/** VisibilityFilter（004 組件圖）：學生視角過濾 */
export const visibilityFilter = { buildView };
