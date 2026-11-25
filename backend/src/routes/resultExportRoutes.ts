import { Router, type NextFunction, type Request, type Response } from 'express';
import type { UserRepository } from '../domain/ports.js';
import { AppError, ErrorCodes } from '../lib/errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { confirmBody } from '../schemas/resultExport.js';
import type { CsvExportService } from '../services/csvExportService.js';
import type { SessionService } from '../services/sessionService.js';
import type { WritebackService } from '../services/writebackService.js';

export interface ResultExportRoutesDeps {
  writeback: WritebackService;
  csv: CsvExportService;
  sessions: SessionService;
  users: UserRepository;
}

/** 只限老師（FR-004）：未登入 401、學生 403「權限不足」，且不回傳任何結果資料 */
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

/** 非同步處理函式的錯誤交給 ErrorHandler */
const run =
  (fn: (req: Request, res: Response) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };

/**
 * ResultExportRoutes（005 contracts/openapi.yaml；diagrams/005-sequence-*.puml）：
 * 掛載於 /api/teacher/activity，與 004 的 ActivityRoutes 共用路徑前綴。
 */
export function resultExportRoutes(deps: ResultExportRoutesDeps): Router {
  const router = Router();
  const guard = [requireAuth(deps.sessions, deps.users), teacherOnly];

  router.post(
    '/writeback/preview',
    ...guard,
    run(async (req, res) => {
      res.json(await deps.writeback.preview(req.auth!.user.id));
    }),
  );

  router.post(
    '/writeback/confirm',
    ...guard,
    validate({ body: confirmBody }),
    run(async (req, res) => {
      const body = req.body as { previewId: string; mode?: string; fallbackKeys?: string[] };
      res.json(
        await deps.writeback.confirm(
          req.auth!.user.id,
          body.previewId,
          body.mode,
          body.fallbackKeys,
        ),
      );
    }),
  );

  router.get(
    '/export.csv',
    ...guard,
    run((req, res) => {
      const file = deps.csv.export(req.auth!.user.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="activity-results.csv"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.send(file.content);
    }),
  );

  return router;
}
