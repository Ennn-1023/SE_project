import {
  DEFAULT_SECONDS,
  MAX_SECONDS,
  MIN_SECONDS,
  validateSeconds,
  type TeacherStatus,
} from '@buzzer/shared';
import type { Repository } from '../data/repositories';
import { AppError } from '../http/errors';
import type { Activity, ActivityQuestion, ClosedReason } from './buzzerTypes';

export { DEFAULT_SECONDS, MAX_SECONDS, MIN_SECONDS };

export interface MachineHooks {
  /** 題目（或新一輪）開放時：清空作答中的送出、記錄參與組別 */
  onQuestionOpened?(question: ActivityQuestion, round: number): void;
  /** 題目結束時，在狀態寫入與推播前呼叫（產生結果、寫入事件） */
  onQuestionClosed?(questionId: string, round: number, reason: ClosedReason): void;
  /** dev reset 時 */
  onReset?(): void;
  /** 每次階段變化後（推播給學生與老師） */
  onChange?(activity: Activity | null): void;
}

/**
 * 活動階段狀態機（004 data-model.md §2）。伺服器為唯一真實來源。
 * 所有方法皆為同步：Node.js 單執行緒保證「檢查 → 寫入」不會被其他請求插入（research.md R11）。
 */
export class ActivityStateMachine {
  hooks: MachineHooks = {};
  private state: Activity | null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly repo: Repository) {
    this.state = repo.getCurrentActivity();
  }

  /** 目前活動（含已結束的上一場）；從未開始過任何活動時為 null */
  get activity(): Readonly<Activity> | null {
    return this.state ? { ...this.state } : null;
  }

  status(): TeacherStatus {
    const s = this.state;
    return {
      phase: s ? s.phase : 'NONE',
      currentQuestionId: s?.currentQuestionId ?? null,
      endsAt: s?.endsAt == null ? null : new Date(s.endsAt).toISOString(),
    };
  }

  /** 開始活動（活動列與題目快照已由 ActivityService 寫入）；已有未結束活動時拒絕 */
  start(activity: Activity): void {
    if (this.state && this.state.phase !== 'ENDED') throw new AppError('ACTIVITY_ALREADY_RUNNING');
    this.clearTimer();
    this.state = { ...activity, phase: 'WAITING', currentQuestionId: null, openedAt: null, endsAt: null };
    this.repo.saveActivity(this.state);
    this.emit();
  }

  /** 開放未開放過的題目（WAITING 或 CLOSED 起始，research.md R4） */
  open(questionId: string, seconds?: number): void {
    this.openRound(questionId, seconds, false);
  }

  /** 重新開放已結束的題目，開始新一輪（FR-007a；確認由 ActivityService 檢查） */
  reopen(questionId: string, seconds?: number): void {
    this.openRound(questionId, seconds, true);
  }

  /** dev：立即時間到 */
  timeUp(): void {
    const s = this.requireActivity();
    if (s.phase !== 'ANSWERING') this.reject(s, '時間到', '作答中');
    this.closeQuestion('TIME_UP');
  }

  /** 手動結束；目前題目已結束（例如剛好時間到）時視為無變化（US2-5） */
  manualClose(): void {
    const s = this.requireActivity();
    if (s.phase === 'CLOSED') return;
    if (s.phase !== 'ANSWERING') this.reject(s, '手動結束', '作答中');
    this.closeQuestion('MANUAL');
  }

  /** 冪等：已不是 ANSWERING 時直接回傳 false，確保只結束一次（FR-011） */
  closeQuestion(reason: ClosedReason, notify = true): boolean {
    const s = this.state;
    if (!s || s.phase !== 'ANSWERING' || !s.currentQuestionId) return false;
    this.clearTimer();
    const question = this.repo.getQuestion(s.currentQuestionId);
    if (question) {
      this.hooks.onQuestionClosed?.(question.questionId, question.currentRound, reason);
      this.repo.updateQuestionState({
        ...question,
        status: 'CLOSED',
        closedAt: Date.now(),
        closedReason: reason,
      });
    }
    this.state = { ...s, phase: 'CLOSED', openedAt: null, endsAt: null };
    this.repo.saveActivity(this.state);
    if (notify) this.emit();
    return true;
  }

  /** 已結束 → 等待開放（選用）；已在等待開放時無變化 */
  backToWaiting(): void {
    const s = this.requireActivity();
    if (s.phase === 'WAITING') return;
    if (s.phase !== 'CLOSED') this.reject(s, '回到等待畫面', '已結束');
    this.state = { ...s, phase: 'WAITING', currentQuestionId: null, openedAt: null, endsAt: null };
    this.repo.saveActivity(this.state);
    this.emit();
  }

  /** 結束整場活動；作答中先結束目前題目並產生結果；已結束時無變化 */
  end(): void {
    const s = this.state;
    if (!s) throw new AppError('NO_ACTIVITY');
    if (s.phase === 'ENDED') return;
    if (s.phase === 'ANSWERING') this.closeQuestion('ACTIVITY_ENDED', false);
    this.state = {
      ...this.state!,
      phase: 'ENDED',
      currentQuestionId: null,
      openedAt: null,
      endsAt: null,
      endedAt: Date.now(),
    };
    this.repo.saveActivity(this.state);
    this.emit();
  }

  /** dev 專用：從任何階段（含 ENDED）回到 WAITING 並清除所有結果 */
  reset(): void {
    const s = this.state;
    if (!s) throw new AppError('NO_ACTIVITY');
    this.clearTimer();
    this.repo.clearOutcomes(s.id);
    this.hooks.onReset?.();
    this.state = {
      ...s,
      phase: 'WAITING',
      currentQuestionId: null,
      openedAt: null,
      endsAt: null,
      endedAt: null,
      notice: null,
    };
    this.repo.saveActivity(this.state);
    this.emit();
  }

  /**
   * 伺服器在作答中重啟（FR-026、research.md R5）：捨棄本輪、活動回到 WAITING；
   * 題目若仍有有效結果（重新開放的題目）則恢復為 CLOSED，否則回到 NOT_OPENED。
   * 回傳給老師的提示文字；不在作答中時回傳 null。
   */
  recoverAfterRestart(): string | null {
    const s = this.state;
    if (!s || s.phase !== 'ANSWERING') return null;
    const question = s.currentQuestionId ? this.repo.getQuestion(s.currentQuestionId) : null;
    let notice = '伺服器重新啟動，目前題目作答已取消，可重新開放';
    if (question) {
      const result = this.repo.getResult(s.id, question.questionId);
      const restored: ActivityQuestion = result
        ? {
            ...question,
            status: 'CLOSED',
            currentRound: Math.max(0, question.currentRound - 1),
            openedAt: null,
            closedAt: result.closedAt,
            closedReason: result.closedReason,
          }
        : {
            ...question,
            status: 'NOT_OPENED',
            currentRound: Math.max(0, question.currentRound - 1),
            seconds: null,
            openedAt: null,
            closedAt: null,
            closedReason: null,
          };
      this.repo.updateQuestionState(restored);
      notice = result
        ? `伺服器重新啟動，第 ${question.label} 題重新作答已取消，保留原結果`
        : `伺服器重新啟動，第 ${question.label} 題作答已取消，可重新開放`;
    }
    this.state = { ...s, phase: 'WAITING', currentQuestionId: null, openedAt: null, endsAt: null, notice };
    this.repo.saveActivity(this.state);
    return notice;
  }

  /** 清除重啟提示（老師下一次操作後） */
  clearNotice(): void {
    if (!this.state?.notice) return;
    this.state = { ...this.state, notice: null };
    this.repo.saveActivity(this.state);
  }

  dispose(): void {
    this.clearTimer();
  }

  private openRound(questionId: string, rawSeconds: number | undefined, reopen: boolean): void {
    const check = validateSeconds(rawSeconds);
    if (!check.ok) throw new AppError('INVALID_SECONDS', 'seconds');
    const s = this.requireActivity();
    const question = this.repo.getQuestion(questionId);
    if (!question || question.activityId !== s.id) throw new AppError('QUESTION_NOT_FOUND', 'questionId');

    if (s.phase === 'ANSWERING') {
      // 重複送出同一個開放請求：無變化（FR-014）
      if (s.currentQuestionId === questionId) return;
      const current = s.currentQuestionId ? this.repo.getQuestion(s.currentQuestionId) : null;
      throw new AppError('INVALID_TRANSITION', null, {
        phase: s.phase,
        message: `目前第 ${current?.label ?? '?'} 題作答中`,
        hint: '請先結束搶答再開放其他題目',
      });
    }
    if (s.phase !== 'WAITING' && s.phase !== 'CLOSED') {
      this.reject(s, reopen ? '重新開放' : '開放題目', '等待開放或已結束');
    }
    if (reopen && question.status !== 'CLOSED') throw new AppError('QUESTION_NOT_CLOSED', 'questionId');
    if (!reopen && question.status === 'CLOSED') {
      throw new AppError('QUESTION_ALREADY_CLOSED', 'questionId', { label: question.label });
    }

    const seconds = check.value;
    const now = Date.now();
    const round = question.currentRound + 1;
    const opened: ActivityQuestion = {
      ...question,
      status: 'ANSWERING',
      currentRound: round,
      seconds,
      openedAt: now,
      closedAt: null,
      closedReason: null,
    };
    this.clearTimer();
    this.repo.updateQuestionState(opened);
    this.hooks.onQuestionOpened?.(opened, round);
    this.state = {
      ...s,
      phase: 'ANSWERING',
      currentQuestionId: questionId,
      openedAt: now,
      endsAt: now + seconds * 1000,
      notice: null,
    };
    this.repo.saveActivity(this.state);
    this.timer = setTimeout(() => this.closeQuestion('TIME_UP'), seconds * 1000);
    this.emit();
  }

  private requireActivity(): Activity {
    if (!this.state) throw new AppError('NO_ACTIVITY');
    if (this.state.phase === 'ENDED') throw new AppError('ACTIVITY_ENDED');
    return this.state;
  }

  private reject(s: Activity, action: string, allowed: string): never {
    throw new AppError('INVALID_TRANSITION', null, { phase: s.phase, action, allowed });
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): void {
    this.hooks.onChange?.(this.activity);
  }
}
