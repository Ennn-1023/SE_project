import { createHmac, randomBytes } from 'node:crypto';
import type { SessionRepository } from '../domain/ports.js';
import { isExpired, type Session } from '../domain/types.js';
import type { Clock } from '../lib/clock.js';
import { AppError, ErrorCodes } from '../lib/errors.js';

export interface SessionServiceConfig {
  sessionSecret: string;
  sessionIdleTimeout: number;
}

export interface CreatedSession {
  session: Session;
  /** 只交給瀏覽器 cookie 的原始 token；資料庫只存其 HMAC。 */
  token: string;
}

/** SessionService（research R5）：伺服器端可撤銷的登入狀態。參數 token 為 cookie 中的原始值。 */
export class SessionService {
  constructor(
    private readonly repo: SessionRepository,
    private readonly config: SessionServiceConfig,
    private readonly clock: Clock,
  ) {}

  private idOf(token: string): string {
    return createHmac('sha256', this.config.sessionSecret).update(token).digest('hex');
  }

  create(userId: number): CreatedSession {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const session: Session = {
      id: this.idOf(token),
      userId,
      createdAt: now,
      lastActiveAt: now,
      revoked: false,
    };
    this.repo.create(session);
    return { session, token };
  }

  validate(token: string): Session {
    const session = token ? this.repo.findById(this.idOf(token)) : null;
    if (
      !session ||
      session.revoked ||
      isExpired(session, this.clock.now(), this.config.sessionIdleTimeout)
    ) {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, '登入狀態已失效，請重新登入', {
        hint: '請回到登入頁重新登入',
      });
    }
    return session;
  }

  touch(token: string): void {
    this.repo.updateLastActive(this.idOf(token), this.clock.now());
  }

  revoke(token: string): void {
    this.repo.revoke(this.idOf(token), this.clock.now());
  }

  revokeAllForUser(userId: number): void {
    this.repo.revokeAllForUser(userId, this.clock.now());
  }
}
