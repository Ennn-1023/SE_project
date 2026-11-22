import type { TeacherStatus } from '@buzzer/shared';
import type { Repository } from '../data/repositories';
import { AppError } from '../http/errors';
import type { Activity, ClosedReason } from './types';

export const DEFAULT_SECONDS = 60;
export const MIN_SECONDS = 5;
export const MAX_SECONDS = 600;

export interface MachineHooks {
  /** 題目開放時（清空作答中的送出） */
  onQuestionOpened?(questionId: string): void;
  /** 題目結束時，在推播前呼叫（產生結果） */
  onQuestionClosed?(questionId: string, reason: ClosedReason): void;
  /** dev reset 時 */
  onReset?(): void;
  /** 每次階段變化後（推播給學生） */
  onChange?(activity: Activity): void;
}

/**
 * 活動階段狀態機（data-model.md「狀態轉換」）。伺服器為唯一真實來源。
 */
export class ActivityStateMachine {
  hooks: MachineHooks = {};
  private state: Activity;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly repo: Repository) {
    const a = repo.getCurrentActivity();
    if (!a) throw new Error('找不到活動資料，請先執行 seed');
    this.state = a;
  }

  get activity(): Readonly<Activity> {
    return { ...this.state };
  }

  status(): TeacherStatus {
    return {
      phase: this.state.phase,
      currentQuestionId: this.state.currentQuestionId,
      endsAt: this.state.endsAt == null ? null : new Date(this.state.endsAt).toISOString(),
    };
  }

  /** 伺服器在作答中重啟：捨棄該題，回到 WAITING（FR-020a） */
  recoverAfterRestart(): boolean {
    if (this.state.phase !== 'ANSWERING') return false;
    this.state = { ...this.state, phase: 'WAITING', currentQuestionId: null, endsAt: null };
    this.repo.saveActivity(this.state);
    return true;
  }

  open(questionId: string, seconds: number = DEFAULT_SECONDS): void {
    if (
      typeof seconds !== 'number' ||
      !Number.isInteger(seconds) ||
      seconds < MIN_SECONDS ||
      seconds > MAX_SECONDS
    ) {
      throw new AppError('INVALID_SECONDS', 'seconds');
    }
    if (!this.repo.getQuestion(questionId)) throw new AppError('QUESTION_NOT_FOUND', 'questionId');
    this.requirePhase(['WAITING'], '開放題目', '等待開放');
    if (this.repo.hasResult(this.state.id, questionId)) {
      throw new AppError('QUESTION_ALREADY_CLOSED', 'questionId');
    }
    const endsAt = Date.now() + seconds * 1000;
    this.state = { ...this.state, phase: 'ANSWERING', currentQuestionId: questionId, endsAt };
    this.hooks.onQuestionOpened?.(questionId);
    this.repo.saveActivity(this.state);
    this.timer = setTimeout(() => this.closeQuestion('TIME_UP'), seconds * 1000);
    this.emit();
  }

  timeUp(): void {
    this.requirePhase(['ANSWERING'], '時間到', '作答中');
    this.closeQuestion('TIME_UP');
  }

  manualClose(): void {
    this.requirePhase(['ANSWERING'], '手動結束', '作答中');
    this.closeQuestion('MANUAL');
  }

  /** 冪等：已不是 ANSWERING 時直接回傳 false，確保只結束一次 */
  closeQuestion(reason: ClosedReason, notify = true): boolean {
    if (this.state.phase !== 'ANSWERING' || !this.state.currentQuestionId) return false;
    this.clearTimer();
    const questionId = this.state.currentQuestionId;
    this.hooks.onQuestionClosed?.(questionId, reason);
    this.state = { ...this.state, phase: 'CLOSED', endsAt: null };
    this.repo.saveActivity(this.state);
    if (notify) this.emit();
    return true;
  }

  next(): void {
    this.requirePhase(['CLOSED'], '下一題', '已結束');
    this.state = { ...this.state, phase: 'WAITING', currentQuestionId: null, endsAt: null };
    this.repo.saveActivity(this.state);
    this.emit();
  }

  end(): void {
    if (this.state.phase === 'ENDED') throw new AppError('ACTIVITY_ENDED');
    if (this.state.phase === 'ANSWERING') this.closeQuestion('ACTIVITY_ENDED', false);
    this.state = { ...this.state, phase: 'ENDED', currentQuestionId: null, endsAt: null };
    this.repo.saveActivity(this.state);
    this.emit();
  }

  /** dev 專用：從任何階段（含 ENDED）回到 WAITING 並清除所有結果 */
  reset(): void {
    this.clearTimer();
    this.repo.clearOutcomes(this.state.id);
    this.hooks.onReset?.();
    this.state = { ...this.state, phase: 'WAITING', currentQuestionId: null, endsAt: null };
    this.repo.saveActivity(this.state);
    this.emit();
  }

  dispose(): void {
    this.clearTimer();
  }

  private requirePhase(allowed: Activity['phase'][], action: string, allowedLabel: string): void {
    if (this.state.phase === 'ENDED' && !allowed.includes('ENDED')) {
      throw new AppError('ACTIVITY_ENDED');
    }
    if (!allowed.includes(this.state.phase)) {
      throw new AppError('INVALID_TRANSITION', null, {
        phase: this.state.phase,
        action,
        allowed: allowedLabel,
      });
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): void {
    this.hooks.onChange?.(this.activity);
  }
}
