import { Router } from 'express';
import { z } from 'zod';
import type { DevStudent } from '@buzzer/shared';
import type { AppContext } from '../../context';
import { AppError, parseOrThrow } from '../errors';
import { signToken } from '../middleware/auth';

const loginSchema = z.object({
  studentId: z.string().trim().min(1, { error: '不可為空' }).max(64, { error: '最多 64 字元' }),
});

/** dev 專用 mock 登入（FR-024）；只在 ENABLE_DEV_TOOLS=true 時掛載 */
export function devAuthRouter(ctx: AppContext): Router {
  const r = Router();

  r.get('/students', (_req, res) => {
    const teams = new Map(ctx.repo.listTeams(ctx.machine.activity.id).map((t) => [t.teamId, t.name]));
    const list: DevStudent[] = ctx.repo.listStudents().map((s) => ({
      studentId: s.studentId,
      name: s.name,
      teamName: s.teamId ? (teams.get(s.teamId) ?? null) : null,
    }));
    res.json(list);
  });

  r.post('/login', (req, res) => {
    const { studentId } = parseOrThrow(loginSchema, req.body);
    const student = ctx.repo.getStudent(studentId);
    if (!student) {
      throw new AppError('VALIDATION_ERROR', 'studentId', {
        message: '找不到此學號',
        hint: '請從清單中選擇學生',
      });
    }
    res.json({ token: signToken(student.studentId, ctx.config.sessionSecret), student });
  });

  return r;
}
