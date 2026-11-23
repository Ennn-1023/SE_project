import type { Config } from '../config/env.js';
import type { PasswordHasher, UserRepository } from '../domain/ports.js';
import { isLocked, normalizeAccount, type User } from '../domain/types.js';
import type { Clock } from '../lib/clock.js';
import { AppError, ErrorCodes } from '../lib/errors.js';
import { DUMMY_PASSWORD_HASH } from '../lib/password.js';
import type { CreatedSession, SessionService } from './sessionService.js';

export interface LoginResult {
  user: User;
  session: CreatedSession;
}

const invalidCredentials = () =>
  new AppError(ErrorCodes.INVALID_CREDENTIALS, '帳號或密碼錯誤', {
    hint: '請確認學號（帳號）與密碼後再試一次',
  });

function accountLocked(lockedUntil: Date, now: Date): AppError {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return new AppError(ErrorCodes.ACCOUNT_LOCKED, `嘗試次數過多，請 ${minutes} 分鐘後再試`, {
    hint: '如忘記密碼，請洽老師重設',
    details: { retryAfterSeconds },
  });
}

/** AuthService：依 diagrams/001-sequence-login.puml 實作登入、登出與修改密碼。 */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionService,
    private readonly hasher: PasswordHasher,
    private readonly config: Pick<Config, 'studentDefaultPassword'>,
    private readonly clock: Clock,
  ) {}

  async login(account: string, password: string): Promise<LoginResult> {
    const user = this.users.findByAccount(normalizeAccount(account));
    const now = this.clock.now();

    if (user && isLocked(user, now)) {
      throw accountLocked(user.lockedUntil!, now);
    }

    if (!user) {
      // 帳號不存在時仍執行一次比對，讓回應時間與密碼錯誤相近（FR-018）
      await this.hasher.verify(password, DUMMY_PASSWORD_HASH);
      throw invalidCredentials();
    }

    const ok = await this.hasher.verify(password, user.passwordHash);
    if (!ok) {
      this.users.recordLoginFailure(user.id, now);
      const updated = this.users.findById(user.id);
      if (updated && isLocked(updated, now)) {
        throw accountLocked(updated.lockedUntil!, now);
      }
      throw invalidCredentials();
    }

    this.users.resetLoginFailures(user.id);
    const session = this.sessions.create(user.id);
    return { user: this.users.findById(user.id)!, session };
  }

  logout(token: string): void {
    this.sessions.revoke(token);
  }

  /**
   * 修改自己的密碼（FR-024，學生與老師皆可）。目前密碼錯誤回 400 INVALID_CURRENT_PASSWORD，
   * 不視為未登入；其他裝置的登入狀態保持有效。
   */
  async changePassword(
    userId: number,
    current: string,
    next: string,
    confirm: string,
  ): Promise<void> {
    const user = this.users.findById(userId);
    if (!user) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, '請先登入', { hint: '請回到登入頁重新登入' });
    }
    if (!(await this.hasher.verify(current, user.passwordHash))) {
      throw new AppError(ErrorCodes.INVALID_CURRENT_PASSWORD, '目前密碼不正確', {
        field: 'currentPassword',
        hint: '請重新輸入目前使用中的密碼',
      });
    }
    if (next !== confirm) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '兩次輸入的新密碼不一致', {
        field: 'confirmPassword',
        hint: '請在兩個欄位輸入相同的新密碼',
      });
    }
    if (next === this.config.studentDefaultPassword) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, '新密碼不可與預設密碼相同', {
        field: 'newPassword',
        hint: '請設定一組只有你知道的密碼',
      });
    }
    const hash = await this.hasher.hash(next);
    this.users.updatePassword(user.id, hash, false);
  }
}
