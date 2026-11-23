import type { RequestHandler } from 'express';
import type { Repository } from '../../data/repositories';
import type { UserRepository } from '../../domain/ports';
import type { Student } from '../../domain/buzzerTypes';
import { cookieValue, SESSION_COOKIE } from '../../middleware/requireAuth';
import type { SessionService } from '../../services/sessionService';
import { AppError } from '../errors';

/**
 * 搶答 API 的學生身分（整合 001 F1 登入）：須先通過 requireAuth 與 requireRole('STUDENT')，
 * 再由伺服器查出學生目前的組別，不接受前端自報。
 */
export function attachStudent(repo: Repository): RequestHandler {
  return (req, res, next) => {
    const account = req.auth?.user.account;
    const student = account ? repo.getStudent(account) : null;
    if (!student) throw new AppError('UNAUTHORIZED');
    res.locals.student = student;
    next();
  };
}

export function currentStudent(locals: Record<string, unknown>): Student {
  return locals.student as Student;
}

export interface SocketAuthDeps {
  sessions: SessionService;
  users: UserRepository;
  repo: Repository;
}

/**
 * Socket.IO 握手驗證：以 Cookie 中與 REST 相同的 session（sid）驗證，只允許學生。
 * 不合法、已登出、閒置逾時或非學生時回傳 null。
 */
export function authenticateCookie(
  cookieHeader: string | undefined,
  deps: SocketAuthDeps,
): Student | null {
  const token = cookieValue(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  try {
    const session = deps.sessions.validate(token);
    const user = deps.users.findById(session.userId);
    if (!user || user.role !== 'STUDENT') return null;
    deps.sessions.touch(token);
    return deps.repo.getStudent(user.account);
  } catch {
    return null;
  }
}
