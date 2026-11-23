import { Router, type Response } from 'express';
import type { Config } from '../config/env.js';
import type { UserRepository } from '../domain/ports.js';
import type { Student, User } from '../domain/types.js';
import { requireAuth, SESSION_COOKIE } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordBody,
  loginBody,
  type ChangePasswordBody,
  type LoginBody,
} from '../schemas/auth.js';
import type { AuthService } from '../services/authService.js';
import type { SessionService } from '../services/sessionService.js';

/** CurrentUser（openapi.yaml）：絕不包含密碼雜湊等內部欄位。 */
export function toCurrentUser(user: User) {
  return {
    account: user.account,
    displayName: user.displayName,
    role: user.role,
    ...(user.role === 'STUDENT' ? { groupNumber: (user as Student).groupNumber } : {}),
  };
}

export interface AuthRoutesDeps {
  auth: AuthService;
  sessions: SessionService;
  users: UserRepository;
  config: Pick<Config, 'nodeEnv' | 'sessionIdleTimeout'>;
}

/** AuthRoutes（/api/auth）。 */
export function authRoutes(deps: AuthRoutesDeps): Router {
  const router = Router();
  const auth = requireAuth(deps.sessions, deps.users);
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: deps.config.nodeEnv === 'production',
  };

  const clearSessionCookie = (res: Response) => res.clearCookie(SESSION_COOKIE, cookieOptions);

  router.post('/login', validate({ body: loginBody }), async (req, res) => {
    const { account, password } = req.body as LoginBody;
    const { user, session } = await deps.auth.login(account, password);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions);
    res.json({ user: toCurrentUser(user) });
  });

  router.get('/me', auth, (req, res) => {
    res.json({ user: toCurrentUser(req.auth!.user) });
  });

  router.post(
    '/change-password',
    auth,
    validate({ body: changePasswordBody }),
    async (req, res) => {
      const { currentPassword, newPassword, confirmPassword } = req.body as ChangePasswordBody;
      await deps.auth.changePassword(
        req.auth!.user.id,
        currentPassword,
        newPassword,
        confirmPassword,
      );
      res.status(204).end();
    },
  );

  router.post('/logout', auth, (req, res) => {
    deps.auth.logout(req.auth!.token);
    clearSessionCookie(res);
    res.status(204).end();
  });

  return router;
}
