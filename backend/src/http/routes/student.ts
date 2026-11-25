import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context';
import { AppError, parseOrThrow } from '../errors';
import { attachStudent, currentStudent } from '../middleware/auth';

/**
 * 送出（002 contracts/rest-api.md；004 contracts/openapi.yaml /student/submissions）：
 * 題組以 answers[]（每小題一個）送出；單題仍接受 002 的 answer 字串。
 * 長度與空白規則由 shared 的 validatePartAnswers 判定，才能回傳指出小題的錯誤碼。
 */
const submitSchema = z
  .object({
    questionId: z.string().trim().min(1, { error: '不可為空' }).max(64, { error: '最多 64 字元' }),
    answer: z.string().optional(),
    answers: z.array(z.unknown()).max(10, { error: '最多 10 個小題' }).optional(),
  })
  .refine((b) => b.answer !== undefined || b.answers !== undefined, {
    path: ['answers'],
    message: '答案為必填',
  });

/** 學生 API（002 contracts/rest-api.md） */
export function studentRouter(ctx: AppContext): Router {
  const r = Router();
  // 登入與學生角色由外層的 requireAuth + requireRole('STUDENT') 檢查（001 F1）
  r.use(attachStudent(ctx.repo));

  r.get('/state', (_req, res) => {
    res.json(ctx.viewFor(currentStudent(res.locals)));
  });

  r.post('/submissions', (req, res) => {
    const student = currentStudent(res.locals);
    if (!student.teamId) throw new AppError('NO_TEAM');
    const body = parseOrThrow(submitSchema, req.body ?? {});
    const answers = body.answers ?? [body.answer];
    const s = ctx.submissions.submit(student, body.questionId, answers);
    // 只推播給本組（同組其他分頁／裝置看到「本組已送出」）；回應不含 rank（002 FR-015）
    ctx.realtime.pushToTeam(s.teamId);
    // 老師監控看板 1 秒內更新（004 FR-016）
    ctx.realtime.pushTeachers();
    res
      .status(201)
      .json({ questionId: s.questionId, teamId: s.teamId, answer: s.answer, answers: s.answers });
  });

  return r;
}

/** StudentRoutes（004 組件圖）：與 studentRouter 相同 */
export const studentRoutes = studentRouter;
