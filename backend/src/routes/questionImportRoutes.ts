import { Router, type NextFunction, type Request, type Response } from 'express';
import type { UserRepository } from '../domain/ports.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createDraftBody, draftIdParams, saveAnnotationsBody } from '../schemas/questionImport.js';
import type {
  DraftWithValidation,
  QuestionImportService,
} from '../services/questionImportService.js';
import type { SessionService } from '../services/sessionService.js';

export interface QuestionImportRoutesDeps {
  imports: QuestionImportService;
  sessions: SessionService;
  users: UserRepository;
}

/** 草稿對外格式（contracts/openapi.yaml `Draft`）。 */
export function toDraftView({ draft, validation }: DraftWithValidation) {
  return {
    id: draft.id,
    revision: draft.revision,
    expiresAt: draft.expiresAt.toISOString(),
    source: draft.source,
    sheets: draft.sheets,
    grid: draft.snapshot,
    annotations: draft.annotations,
    restoredCount: draft.restoredCount,
    validation,
  };
}

type Handler = (req: Request, res: Response) => Promise<void> | void;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};

/** QuestionImportRoutes（/api/question-import；diagrams/003-sequence-import.puml）。 */
export function questionImportRoutes(deps: QuestionImportRoutesDeps): Router {
  const router = Router();
  router.use(requireAuth(deps.sessions, deps.users), requireRole('TEACHER'));

  router.post(
    '/drafts',
    validate({ body: createDraftBody }),
    wrap(async (req, res) => {
      const result = await deps.imports.createDraft(
        req.auth!.user.id,
        req.body.link,
        req.body.sheetId,
      );
      res.status(201).json({ draft: toDraftView(result) });
    }),
  );

  router.get('/drafts/current', (req, res) => {
    const result = deps.imports.getCurrentDraft(req.auth!.user.id);
    res.json({ draft: result ? toDraftView(result) : null });
  });

  router.put(
    '/drafts/:draftId/annotations',
    validate({ params: draftIdParams, body: saveAnnotationsBody }),
    (req, res) => {
      const { draft, validation } = deps.imports.saveAnnotations(
        req.auth!.user.id,
        String(req.params.draftId),
        req.body.revision,
        req.body.annotations,
      );
      res.json({
        revision: draft.revision,
        annotations: draft.annotations,
        validation,
        expiresAt: draft.expiresAt.toISOString(),
      });
    },
  );

  router.post('/drafts/:draftId/preview', validate({ params: draftIdParams }), (req, res) => {
    res.json(deps.imports.preview(req.auth!.user.id, String(req.params.draftId)));
  });

  router.post(
    '/drafts/:draftId/confirm',
    validate({ params: draftIdParams }),
    wrap(async (req, res) => {
      const questionSet = await deps.imports.confirm(req.auth!.user.id, String(req.params.draftId));
      res.json({ questionSet });
    }),
  );

  router.delete('/drafts/:draftId', validate({ params: draftIdParams }), (req, res) => {
    deps.imports.cancel(req.auth!.user.id, String(req.params.draftId));
    res.status(204).end();
  });

  return router;
}
