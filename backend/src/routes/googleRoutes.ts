import { Router } from 'express';
import type { UserRepository } from '../domain/ports.js';
import { readCookie, requireAuth, SESSION_COOKIE } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { oauthCallbackQuery } from '../schemas/google.js';
import type { CallbackResult, GoogleAuthService } from '../services/googleAuthService.js';
import type { SessionService } from '../services/sessionService.js';

export interface GoogleRoutesDeps {
  google: GoogleAuthService;
  sessions: SessionService;
  users: UserRepository;
}

/** 回呼後導回題目管理頁（contracts/ui-routes.md），只帶固定結果代碼。 */
const redirectTarget = (result: CallbackResult) => `/teacher/questions?google=${result}`;

/** GoogleRoutes（/api/google；diagrams/003-sequence-connect.puml）。 */
export function googleRoutes(deps: GoogleRoutesDeps): Router {
  const router = Router();

  // Google 導回：瀏覽器導向，不掛 requireAuth；以 cookie 的 session 與 state 綁定的 session 比對
  router.get('/oauth/callback', async (req, res, next) => {
    try {
      const parsed = oauthCallbackQuery.safeParse(req.query);
      if (!parsed.success) {
        res.redirect(302, redirectTarget('state_invalid'));
        return;
      }
      let sessionId: string | null = null;
      const token = readCookie(req, SESSION_COOKIE);
      if (token) {
        try {
          const session = deps.sessions.validate(token);
          const user = deps.users.findById(session.userId);
          if (user?.role === 'TEACHER') sessionId = session.id;
        } catch {
          sessionId = null;
        }
      }
      const result = await deps.google.handleCallback(parsed.data, sessionId);
      res.redirect(302, redirectTarget(result));
    } catch (err) {
      next(err);
    }
  });

  router.use(requireAuth(deps.sessions, deps.users), requireRole('TEACHER'));

  router.get('/status', (req, res) => {
    res.json(deps.google.getStatus(req.auth!.user.id));
  });

  router.post('/oauth/start', (req, res) => {
    const session = deps.sessions.validate(req.auth!.token);
    res.json({ authUrl: deps.google.startAuthorization(req.auth!.user.id, session.id) });
  });

  router.delete('/connection', async (req, res, next) => {
    try {
      await deps.google.disconnect(req.auth!.user.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
