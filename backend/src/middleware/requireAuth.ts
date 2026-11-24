import type { NextFunction, Request, Response } from 'express';
import type { UserRepository } from '../domain/ports.js';
import type { User } from '../domain/types.js';
import { AppError, ErrorCodes } from '../lib/errors.js';
import type { SessionService } from '../services/sessionService.js';

export const SESSION_COOKIE = 'sid';

export interface AuthState {
  user: User;
  /** cookie 中的原始 token */
  token: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthState;
    }
  }
}

/** 從 Cookie 標頭讀出指定名稱的值。 */
export function readCookie(req: Request, name: string): string | undefined {
  return cookieValue(req.headers.cookie, name);
}

/** 解析 Cookie 標頭字串（REST 與 Socket.IO 握手共用）。 */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

const unauthenticated = () =>
  new AppError(ErrorCodes.UNAUTHENTICATED, '請先登入', { hint: '請回到登入頁重新登入' });

/** RequireAuth（組件圖中介層）：驗證 sid → SessionService.validate → touch → 將使用者放入 req.auth。 */
export function requireAuth(sessions: SessionService, users: UserRepository) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return next(unauthenticated());
    const session = sessions.validate(token);
    const user = users.findById(session.userId);
    if (!user) return next(unauthenticated());
    sessions.touch(token);
    req.auth = { user, token };
    next();
  };
}
