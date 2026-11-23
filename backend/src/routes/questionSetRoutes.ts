import { Router } from 'express';
import type { UserRepository } from '../domain/ports.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import type { QuestionSetService } from '../services/questionSetService.js';
import type { SessionService } from '../services/sessionService.js';
import { toDraftView } from './questionImportRoutes.js';

export interface QuestionSetRoutesDeps {
  questionSets: QuestionSetService;
  sessions: SessionService;
  users: UserRepository;
}

/** QuestionSetRoutes（/api/question-set；diagrams/003-sequence-reimport.puml）。 */
export function questionSetRoutes(deps: QuestionSetRoutesDeps): Router {
  const router = Router();
  router.use(requireAuth(deps.sessions, deps.users), requireRole('TEACHER'));

  router.get('/', (_req, res) => {
    res.json({ questionSet: deps.questionSets.getCurrent() });
  });

  router.delete('/', (req, res) => {
    deps.questionSets.clear(req.auth!.user.id);
    res.status(204).end();
  });

  router.post('/reimport', (req, res, next) => {
    deps.questionSets
      .reimport(req.auth!.user.id)
      .then((result) => res.status(201).json({ draft: toDraftView(result) }))
      .catch(next);
  });

  return router;
}
