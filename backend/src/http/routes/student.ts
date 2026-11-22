import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context';
import { AppError, parseOrThrow } from '../errors';
import { currentStudent, requireStudent } from '../middleware/auth';

const submitSchema = z.object({
  questionId: z.string().trim().min(1, { error: '不可為空' }).max(64, { error: '最多 64 字元' }),
  // 長度與空白規則由 shared 的 validateAnswer 判定，才能回傳 EMPTY_ANSWER／ANSWER_TOO_LONG
  answer: z.string(),
});

/** 學生 API（contracts/rest-api.md） */
export function studentRouter(ctx: AppContext): Router {
  const r = Router();
  r.use(requireStudent(ctx.config.sessionSecret, ctx.repo));

  r.get('/state', (_req, res) => {
    res.json(ctx.viewFor(currentStudent(res.locals)));
  });

  r.post('/submissions', (req, res) => {
    const student = currentStudent(res.locals);
    if (!student.teamId) throw new AppError('NO_TEAM');
    const body = parseOrThrow(submitSchema, req.body ?? {});
    const s = ctx.submissions.submit(student, body.questionId, body.answer);
    // 只推播給本組（同組其他分頁／裝置看到「本組已送出」）；回應不含 rank（FR-015）
    ctx.realtime.pushToTeam(s.teamId);
    res.status(201).json({ questionId: s.questionId, teamId: s.teamId, answer: s.answer });
  });

  return r;
}
