import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../domain/types.js';
import { AppError, ErrorCodes } from '../lib/errors.js';

const FORBIDDEN_MESSAGE: Record<Role, string> = {
  TEACHER: '此功能僅限老師使用',
  STUDENT: '此功能僅限學生使用',
};

/** RequireRole（組件圖中介層）：角色不符回 403（FR-021）。須接在 requireAuth 之後。 */
export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(
        new AppError(ErrorCodes.UNAUTHENTICATED, '請先登入', { hint: '請回到登入頁重新登入' }),
      );
    }
    if (req.auth.user.role !== role) {
      return next(new AppError(ErrorCodes.FORBIDDEN, FORBIDDEN_MESSAGE[role]));
    }
    next();
  };
}
