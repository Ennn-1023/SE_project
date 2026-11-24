import type {
  ActivityQuestionDetail,
  MonitorTeamRow,
  MonitorView,
  QuestionListItem,
  ReadinessView,
  ResultBoardView,
  TeacherActivityView,
} from '@buzzer/shared';
import type { Repository } from '../data/repositories.js';
import { groupNumberOf, teamNameOf } from '../data/repositories.js';
import type { ActivityStateMachine } from '../domain/activityStateMachine.js';
import type { ActivityQuestion, Submission } from '../domain/buzzerTypes.js';
import type { SubmissionService } from '../domain/submissionService.js';
import { AppError } from '../http/errors.js';

/** 目前題目集摘要（開始活動前的檢查用） */
export type QuestionSetSummary = () => { questionCount: number; sourceTitle: string } | null;
/** 目前在線（至少一個 /student 連線）的學號集合 */
export type OnlineStudents = () => ReadonlySet<string>;

export interface MonitorViewBuilderDeps {
  machine: ActivityStateMachine;
  repo: Repository;
  submissions: SubmissionService;
  questionSet: QuestionSetSummary;
  online?: OnlineStudents;
}

const SUMMARY_LENGTH = 40;
const summarize = (s: string) => {
  const chars = [...s.replace(/\s+/g, ' ').trim()];
  return chars.length > SUMMARY_LENGTH ? `${chars.slice(0, SUMMARY_LENGTH).join('')}…` : chars.join('');
};
const byGroup = (a: { teamId: string }, b: { teamId: string }) =>
  (groupNumberOf(a.teamId) ?? 0) - (groupNumberOf(b.teamId) ?? 0);

/**
 * MonitorViewBuilder（004 組件圖、data-model.md §3）：產生只給老師的 TeacherActivityView 與 ResultBoardView。
 * 學生視角另由 VisibilityFilter 產生，本類別的輸出不得送給學生（FR-021）。
 */
export class MonitorViewBuilder {
  /** 在線學生來源；Socket 伺服器建立後才綁定 */
  online: OnlineStudents;

  constructor(private readonly deps: MonitorViewBuilderDeps) {
    this.online = deps.online ?? (() => new Set<string>());
  }

  build(now: number = Date.now()): TeacherActivityView {
    const { machine, repo } = this.deps;
    const activity = machine.activity;
    const questions = activity ? repo.listQuestions(activity.id) : [];
    const current = activity?.currentQuestionId ? repo.getQuestion(activity.currentQuestionId) : null;
    const phase = activity ? activity.phase : 'NONE';

    return {
      phase,
      serverNow: new Date(now).toISOString(),
      activity: activity
        ? {
            id: activity.id,
            sourceTitle: activity.sourceTitle,
            startedAt: activity.startedAt == null ? null : new Date(activity.startedAt).toISOString(),
          }
        : null,
      readiness: phase === 'NONE' || phase === 'ENDED' ? this.readiness() : null,
      questions: questions.map((q) => this.listItem(q)),
      progress: {
        closed: questions.filter((q) => q.status === 'CLOSED').length,
        total: questions.length,
      },
      current:
        current && (phase === 'ANSWERING' || phase === 'CLOSED') ? this.detail(current) : null,
      endsAt:
        phase === 'ANSWERING' && activity?.endsAt != null
          ? new Date(activity.endsAt).toISOString()
          : null,
      monitor: phase === 'ANSWERING' && current ? this.monitor(current) : null,
      result:
        phase === 'CLOSED' && current && repo.hasResult(current.activityId, current.questionId)
          ? this.buildResult(current.questionId)
          : null,
      preselectedQuestionId:
        phase === 'WAITING' || phase === 'CLOSED' ? this.preselect(questions, current) : null,
      notice: activity?.notice ?? null,
    };
  }

  /** 本場已結束題目的有效結果（唯讀，FR-019） */
  buildResult(questionId: string): ResultBoardView {
    const { machine, repo } = this.deps;
    const activity = machine.activity;
    const question = repo.getQuestion(questionId);
    if (!activity || !question || question.activityId !== activity.id) {
      throw new AppError('QUESTION_NOT_FOUND', 'questionId');
    }
    const result = repo.getResult(activity.id, questionId);
    if (!result) throw new AppError('QUESTION_NOT_CLOSED', 'questionId');
    const submissions = repo.listSubmissions(activity.id, questionId);
    const openedAt = result.round === question.currentRound ? question.openedAt : null;
    const rows = this.rows(
      repo.listParticipants(activity.id, questionId, result.round),
      submissions,
      openedAt,
    );
    return {
      question: this.detail(question),
      round: result.round,
      closedReason: result.closedReason,
      rows,
      noSubmission: submissions.length === 0,
    };
  }

  private monitor(question: ActivityQuestion): MonitorView {
    const { repo, submissions } = this.deps;
    const participants = repo.listParticipants(question.activityId, question.questionId, question.currentRound);
    const all = submissions.all().filter((s) => s.questionId === question.questionId);
    const teams = this.rows(participants, all, question.openedAt);
    const participantIds = new Set(participants.map((p) => p.teamId));
    const submittedCount = all.filter((s) => participantIds.has(s.teamId)).length;
    return {
      questionId: question.questionId,
      round: question.currentRound,
      submittedCount,
      teamCount: participants.length,
      allSubmitted: participants.length > 0 && submittedCount === participants.length,
      teams,
    };
  }

  /** 已送出依 rank，其後未送出的參與組別依組號 */
  private rows(
    participants: { teamId: string; teamName: string; memberCount: number }[],
    submissions: Submission[],
    openedAt: number | null,
  ): MonitorTeamRow[] {
    const { repo } = this.deps;
    const online = this.onlineByTeam();
    const members = repo.memberCounts();
    const byTeam = new Map(submissions.map((s) => [s.teamId, s]));
    const submitted = [...submissions].sort((a, b) => a.rank - b.rank).map(
      (s): MonitorTeamRow => ({
        teamId: s.teamId,
        teamName: teamNameOf(groupNumberOf(s.teamId) ?? 0),
        submitted: true,
        rank: s.rank,
        elapsedSeconds:
          openedAt == null ? null : Math.round(Math.max(0, s.receivedAt - openedAt) / 100) / 10,
        submitterName: repo.getStudent(s.studentId)?.name ?? s.studentId,
        answers: s.answers,
        online: online.get(s.teamId) ?? 0,
        members: members.get(s.teamId) ?? 0,
      }),
    );
    const waiting = participants
      .filter((p) => !byTeam.has(p.teamId))
      .sort(byGroup)
      .map(
        (p): MonitorTeamRow => ({
          teamId: p.teamId,
          teamName: p.teamName,
          submitted: false,
          rank: null,
          elapsedSeconds: null,
          submitterName: null,
          answers: null,
          online: online.get(p.teamId) ?? 0,
          members: members.get(p.teamId) ?? p.memberCount,
        }),
      );
    return [...submitted, ...waiting];
  }

  private onlineByTeam(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const studentId of this.online()) {
      const teamId = this.deps.repo.getStudent(studentId)?.teamId;
      if (teamId) counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    }
    return counts;
  }

  private readiness(): ReadinessView {
    const set = this.deps.questionSet();
    const online = this.onlineByTeam();
    return {
      questionCount: set?.questionCount ?? 0,
      sourceTitle: set?.sourceTitle ?? null,
      teams: [...this.deps.repo.memberCounts().entries()].map(([teamId, members]) => ({
        teamId,
        name: teamNameOf(groupNumberOf(teamId) ?? 0),
        members,
        online: online.get(teamId) ?? 0,
      })),
    };
  }

  private listItem(q: ActivityQuestion): QuestionListItem {
    let winnerTeamName: string | null = null;
    if (q.status === 'CLOSED') {
      const result = this.deps.repo.getResult(q.activityId, q.questionId);
      if (result?.winnerTeam) winnerTeamName = teamNameOf(groupNumberOf(result.winnerTeam) ?? 0);
    }
    return {
      questionId: q.questionId,
      label: q.label,
      position: q.position,
      kind: q.kind,
      summary: summarize(q.text),
      status: q.status,
      round: q.currentRound,
      winnerTeamName,
      stem: q.stem,
      parts: this.detail(q).parts,
    };
  }

  private detail(q: ActivityQuestion): ActivityQuestionDetail {
    return {
      questionId: q.questionId,
      label: q.label,
      kind: q.kind,
      stem: q.stem,
      parts: this.deps.repo
        .getQuestionParts(q.questionId)
        .map((p) => ({ partIndex: p.partIndex, partLabel: p.partLabel, text: p.questionText })),
    };
  }

  /** 目前（或最近結束）題目之後第一個未開放的題目；找不到則從頭找；全部結束為 null（research.md R4） */
  private preselect(questions: ActivityQuestion[], current: ActivityQuestion | null): string | null {
    const open = questions.filter((q) => q.status === 'NOT_OPENED');
    if (open.length === 0) return null;
    const lastClosed = [...questions]
      .filter((q) => q.closedAt != null)
      .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))[0];
    const base = current?.position ?? lastClosed?.position ?? 0;
    return (open.find((q) => q.position > base) ?? open[0])!.questionId;
  }
}
