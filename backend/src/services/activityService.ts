import { randomBytes } from 'node:crypto';
import type { ResultBoardView, TeacherActivityView } from '@buzzer/shared';
import type { ActivityEventRepository } from '../db/activityEventRepository.js';
import type { NewActivityQuestion, Repository } from '../data/repositories.js';
import { groupNumberOf, teamNameOf } from '../data/repositories.js';
import type { ActivityStateMachine } from '../domain/activityStateMachine.js';
import type { Activity, ActivityEventType, ClosedReason } from '../domain/buzzerTypes.js';
import type { QuestionSetRepository } from '../domain/questionPorts.js';
import type { ResultService } from '../domain/resultService.js';
import type { SubmissionService } from '../domain/submissionService.js';
import { AppError } from '../http/errors.js';
import type { MonitorViewBuilder } from './monitorViewBuilder.js';

export interface ActivityServiceDeps {
  machine: ActivityStateMachine;
  repo: Repository;
  submissions: SubmissionService;
  results: ResultService;
  monitor: MonitorViewBuilder;
  events: ActivityEventRepository;
  questionSets: Pick<QuestionSetRepository, 'findCurrent'>;
}

const CLOSED_LABEL: Record<ClosedReason, string> = {
  TIME_UP: '時間到',
  MANUAL: '手動結束',
  ACTIVITY_ENDED: '結束活動',
};

const pad = (n: number) => String(n).padStart(2, '0');
function newActivityId(now: Date): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `ACT-${stamp}-${randomBytes(2).toString('hex')}`;
}

/**
 * ActivityService（004 組件圖、diagrams/004-sequence-*.puml）：老師的活動控制。
 * 狀態轉換由 ActivityStateMachine 把關；本服務負責開始活動（題目快照）、確認規則、參與組別、
 * 結果產生與活動事件紀錄（FR-029）。
 */
export class ActivityService {
  /** 手動結束或結束活動時的操作者；時間到等系統事件為 null */
  private pendingActor: number | null = null;

  constructor(private readonly deps: ActivityServiceDeps) {
    const { machine, repo, submissions, results } = deps;
    machine.hooks.onQuestionOpened = (question, round) => {
      const parts = repo.getQuestionParts(question.questionId);
      submissions.startQuestion(
        question.questionId,
        round,
        parts.map((p) => ({ partIndex: p.partIndex, partLabel: p.partLabel })),
      );
      // 參與組別：開放當下至少有 1 位成員的組別（FR-013）
      repo.saveParticipants(
        [...repo.memberCounts().entries()]
          .filter(([, count]) => count > 0)
          .map(([teamId, memberCount]) => ({
            activityId: question.activityId,
            questionId: question.questionId,
            round,
            teamId,
            teamName: teamNameOf(groupNumberOf(teamId) ?? 0),
            memberCount,
          })),
      );
    };
    machine.hooks.onQuestionClosed = (questionId, round, reason) => {
      const activity = machine.activity!;
      results.finalize(activity.id, questionId, round, submissions.all(), reason);
      // 所有結束原因都寫入事件；時間到與結束活動連帶結束屬系統觸發，操作者為 null（FR-029）
      const actor = reason === 'MANUAL' ? this.pendingActor : null;
      this.record('QUESTION_CLOSED', actor, questionId, CLOSED_LABEL[reason]);
    };
  }

  getView(): TeacherActivityView {
    return this.deps.monitor.build();
  }

  /** 開始活動（FR-001～FR-003）：複製目前題目集為本場題目並進入等待開放 */
  startActivity(teacherId: number): TeacherActivityView {
    const { repo, machine, questionSets } = this.deps;
    if (repo.hasRunningActivity()) throw new AppError('ACTIVITY_ALREADY_RUNNING');
    const record = questionSets.findCurrent();
    if (!record || record.questions.length === 0) throw new AppError('NO_QUESTION_SET');
    if (![...repo.memberCounts().values()].some((n) => n > 0)) throw new AppError('NO_TEAM_MEMBERS');

    const now = new Date();
    let id = newActivityId(now);
    while (repo.activityExists(id)) id = newActivityId(now);
    const questions: NewActivityQuestion[] = record.questions.map((q) => ({
      questionId: `${id}-${q.position}`,
      position: q.position,
      label: q.label,
      text: q.kind === 'GROUP' ? (q.stemText ?? q.slots[0]!.questionText) : q.slots[0]!.questionText,
      questionKey: q.questionKey,
      kind: q.kind,
      stem: q.stemText,
      parts: q.slots.map((s) => ({
        partIndex: s.partIndex,
        partLabel: s.partLabel,
        questionText: s.questionText,
        // 005 FR-005：匯入當下的作答格位置（找不到標註時的後備位置）
        answerCell: s.answerCell,
      })),
    }));
    const activity: Activity = {
      id,
      phase: 'WAITING',
      currentQuestionId: null,
      openedAt: null,
      endsAt: null,
      startedAt: now.getTime(),
      startedBy: teacherId,
      endedAt: null,
      sourceTitle: `${record.set.source.spreadsheetTitle}／${record.set.source.sheetTitle}`,
      notice: null,
      // 005 FR-005：寫回目標隨題目快照記錄，之後重新匯入題目集不影響本場
      source: { ...record.set.source },
    };
    repo.createActivity(activity, questions);
    machine.start(activity);
    this.record('STARTED', teacherId, null, `${questions.length} 題`);
    return this.getView();
  }

  /** 開放未開放的題目（FR-007～FR-009）；重複送出同一題為無變化 */
  openQuestion(teacherId: number, questionId: string, seconds?: number): TeacherActivityView {
    const before = this.deps.repo.getQuestion(questionId)?.currentRound;
    this.deps.machine.open(questionId, seconds);
    const after = this.deps.repo.getQuestion(questionId);
    if (after && after.currentRound !== before) {
      this.record('QUESTION_OPENED', teacherId, questionId, `${after.seconds} 秒`);
    }
    return this.getView();
  }

  /** 重新開放已結束題目（FR-007a）：須經確認；新一輪結束後才取代舊結果 */
  reopenQuestion(
    teacherId: number,
    questionId: string,
    seconds: number | undefined,
    confirm: boolean,
  ): TeacherActivityView {
    const { machine, repo } = this.deps;
    const activity = machine.activity;
    if (activity?.phase === 'ANSWERING' && activity.currentQuestionId === questionId) {
      return this.getView();
    }
    if (confirm !== true) throw new AppError('REOPEN_NOT_CONFIRMED', 'confirm');
    const result = activity ? repo.getResult(activity.id, questionId) : null;
    machine.reopen(questionId, seconds);
    const after = repo.getQuestion(questionId);
    const replaced = result?.winnerTeam
      ? `${teamNameOf(groupNumberOf(result.winnerTeam) ?? 0)}搶答成功`
      : '無人送出';
    this.record(
      'QUESTION_REOPENED',
      teacherId,
      questionId,
      `第 ${after?.currentRound ?? '?'} 輪，${after?.seconds ?? '?'} 秒；將取代原結果（${replaced}）`,
    );
    return this.getView();
  }

  /** 手動提前結束（FR-010、FR-011）；題目已結束時為無變化 */
  closeQuestion(teacherId: number): TeacherActivityView {
    this.pendingActor = teacherId;
    try {
      this.deps.machine.manualClose();
    } finally {
      this.pendingActor = null;
    }
    return this.getView();
  }

  /** 已結束 → 等待開放（選用，FR-012） */
  backToWaiting(teacherId: number): TeacherActivityView {
    const { machine } = this.deps;
    const before = machine.activity?.phase;
    machine.backToWaiting();
    machine.clearNotice();
    if (before !== machine.activity?.phase) this.record('BACK_TO_WAITING', teacherId, null, null);
    return this.getView();
  }

  /** 結束整場活動（FR-004）；作答中先結束目前題目並產生結果 */
  endActivity(teacherId: number): TeacherActivityView {
    const { machine } = this.deps;
    const before = machine.activity?.phase;
    this.pendingActor = teacherId;
    try {
      machine.end();
    } finally {
      this.pendingActor = null;
    }
    machine.clearNotice();
    if (before !== 'ENDED') this.record('ENDED', teacherId, null, null);
    return this.getView();
  }

  getQuestionResult(questionId: string): ResultBoardView {
    return this.deps.monitor.buildResult(questionId);
  }

  private record(
    type: ActivityEventType,
    actorId: number | null,
    questionId: string | null,
    detail: string | null,
  ): void {
    const activity = this.deps.machine.activity;
    if (!activity) return;
    this.deps.events.append({ activityId: activity.id, at: new Date(), actorId, type, questionId, detail });
  }
}

