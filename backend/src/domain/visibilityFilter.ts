import type { StudentView } from '@buzzer/shared';
import type { Activity, Question, Submission, Team } from './buzzerTypes';

export interface ViewInput {
  activity: Activity;
  question: Question | null;
  myTeam: Team | null;
  /** 本活動所有組別（結果揭曉時用來顯示組名） */
  teams: Team[];
  /** 目前題目的所有送出；本函式負責過濾 */
  submissions: Submission[];
  now: number;
}

/**
 * 產生學生視角（data-model.md StudentView）。
 * 隔離不變式：phase !== 'CLOSED' 時，輸出不含任何其他組別的資料（FR-015）。
 */
export function buildView(input: ViewInput): StudentView {
  const { activity, question, myTeam, submissions, now } = input;
  const view: StudentView = {
    phase: activity.phase,
    serverNow: new Date(now).toISOString(),
    myTeam: myTeam ? { teamId: myTeam.teamId, name: myTeam.name } : null,
  };

  if ((activity.phase === 'ANSWERING' || activity.phase === 'CLOSED') && question) {
    view.question = { questionId: question.questionId, number: question.number, text: question.text };
    const mine = myTeam ? submissions.find((s) => s.teamId === myTeam.teamId) : undefined;
    view.myTeamSubmission = mine ? { answer: mine.answer } : null;
  }

  if (activity.phase === 'ANSWERING' && activity.endsAt != null) {
    view.endsAt = new Date(activity.endsAt).toISOString();
  }

  // 只有 CLOSED 才揭曉所有組別（FR-016）；依釐清 Q4 不含送出時間與送出者
  if (activity.phase === 'CLOSED' && question) {
    const teamName = new Map(input.teams.map((t) => [t.teamId, t.name]));
    const ordered = [...submissions].sort((a, b) => a.rank - b.rank);
    view.results = ordered.map((s) => ({
      rank: s.rank,
      teamName: teamName.get(s.teamId) ?? s.teamId,
      answer: s.answer,
      isWinner: s.rank === 1,
    }));
    const mine = myTeam ? ordered.find((s) => s.teamId === myTeam.teamId) : undefined;
    view.myTeamOutcome = !mine ? 'NOT_SUBMITTED' : mine.rank === 1 ? 'WIN' : 'LOSE';
  }

  return view;
}
