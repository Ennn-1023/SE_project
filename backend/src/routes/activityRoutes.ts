import { Router, type NextFunction, type Request, type Response } from 'express';
import type { UserRepository } from '../domain/ports.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { AppError, ErrorCodes } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import { openBody, questionIdParams, reopenBody } from '../schemas/activity.js';
import type { ActivityService } from '../services/activityService.js';
import type { SessionService } from '../services/sessionService.js';

export interface ActivityRoutesDeps {
  activities: ActivityService;
  sessions: SessionService;
  users: UserRepository;
}

/**
 * 只限老師（FR-027、US1-7）：學生呼叫時回覆「權限不足」。
 * 與 001 的 requireRole 相同的狀態碼與錯誤碼，只是訊息依 004 規格。
 */
function teacherOnly(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    return next(
      new AppError(ErrorCodes.UNAUTHENTICATED, '請先登入', { hint: '請回到登入頁重新登入' }),
    );
  }
  if (req.auth.user.role !== 'TEACHER') {
    return next(new AppError(ErrorCodes.FORBIDDEN, '權限不足', { hint: '此功能僅限老師使用' }));
  }
  next();
}

/**
 * ActivityRoutes（/api/teacher/activity；004 contracts/openapi.yaml、diagrams/004-sequence-*.puml）。
 * 只限老師（FR-027）；每個操作都回傳最新的 TeacherActivityView。
 */
export function activityRoutes(deps: ActivityRoutesDeps): Router {
  const router = Router();
  const { activities } = deps;
  router.use(requireAuth(deps.sessions, deps.users), teacherOnly);

  router.get('/', (_req, res) => {
    res.json(activities.getView());
  });

  router.post('/start', (req, res) => {
    res.json(activities.startActivity(req.auth!.user.id));
  });

  router.post('/open', validate({ body: openBody }), (req, res) => {
    const body = req.body as { questionId: string; seconds?: unknown };
    res.json(
      activities.openQuestion(req.auth!.user.id, body.questionId, body.seconds as number | undefined),
    );
  });

  router.post('/reopen', validate({ body: reopenBody }), (req, res) => {
    const body = req.body as { questionId: string; seconds?: unknown; confirm?: unknown };
    res.json(
      activities.reopenQuestion(
        req.auth!.user.id,
        body.questionId,
        body.seconds as number | undefined,
        body.confirm === true,
      ),
    );
  });

  router.post('/close', (req, res) => {
    res.json(activities.closeQuestion(req.auth!.user.id));
  });

  router.post('/back-to-waiting', (req, res) => {
    res.json(activities.backToWaiting(req.auth!.user.id));
  });

  router.post('/end', (req, res) => {
    res.json(activities.endActivity(req.auth!.user.id));
  });

  router.get(
    '/questions/:questionId/result',
    validate({ params: questionIdParams }),
    (req, res) => {
      res.json(activities.getQuestionResult(String(req.params.questionId)));
    },
  );

  return router;
}
