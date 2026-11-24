import type { ActivityPhase } from '@buzzer/shared';
import { AppError } from '../http/errors.js';

/** 讀取目前活動階段；沒有任何活動時為 null */
export type PhaseReader = () => ActivityPhase | null;

/**
 * ActivityLockGuard（004 research.md R8）：活動進行中鎖定題目集，作答中鎖定組別。
 * 於 createContainer 建立並注入 001／003 的服務；startServer 建立狀態機後以 bind() 綁定。
 * 未綁定時（例如只測 001／003 的測試 App）一律放行。
 */
export class ActivityLockGuard {
  private readPhase: PhaseReader = () => null;

  bind(phaseReader: PhaseReader): void {
    this.readPhase = phaseReader;
  }

  /** 活動未結束（等待開放、作答中、已結束）時不可清除、重新匯入或確認匯入題目集（FR-005） */
  assertQuestionSetMutable(): void {
    const phase = this.readPhase();
    if (phase !== null && phase !== 'ENDED') throw new AppError('QUESTION_SET_LOCKED');
  }

  /** 題目作答中不可變更組別歸屬或組數（FR-006） */
  assertGroupChangeAllowed(): void {
    if (this.readPhase() === 'ANSWERING') throw new AppError('GROUP_CHANGE_LOCKED');
  }
}
