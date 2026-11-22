import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import type { Repository } from '../../data/repositories';
import type { Student } from '../../domain/types';
import { AppError } from '../errors';

const ALGORITHM = 'HS256';
const EXPIRES_IN = '8h';

/** 簽發學生 token（research.md R7）。正式登入（F1）上線後只需替換簽發來源。 */
export function signToken(studentId: string, secret: string): string {
  return jwt.sign({}, secret, { algorithm: ALGORITHM, expiresIn: EXPIRES_IN, subject: studentId });
}

/** 驗證 token 並回傳 studentId；不合法或過期回傳 null */
export function verifyToken(token: unknown, secret: string): string | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** 從 token 找出學生；伺服器自行查出組別，不接受前端自報 */
export function authenticate(token: unknown, secret: string, repo: Repository): Student | null {
  const studentId = verifyToken(token, secret);
  return studentId ? repo.getStudent(studentId) : null;
}

export function requireStudent(secret: string, repo: Repository): RequestHandler {
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const student = authenticate(token, secret, repo);
    if (!student) throw new AppError('UNAUTHORIZED');
    res.locals.student = student;
    next();
  };
}

export function currentStudent(locals: Record<string, unknown>): Student {
  return locals.student as Student;
}
