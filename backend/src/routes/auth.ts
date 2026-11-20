import { Router } from "express";
import { changePasswordInput, loginInput, type ChangePasswordInput, type LoginInput } from "@se/shared";
import type { AppContext } from "../context.js";
import { toCurrentUser } from "../db/users.js";
import {
  clearSessionCookie,
  getAuth,
  requireAuth,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { changePassword, login, logout } from "../services/authService.js";

/** /api/auth 路由（contracts/api.md Auth）。 */
export function authRouter(ctx: AppContext): Router {
  const router = Router();

  router.post("/login", validate({ body: loginInput }), async (_req, res) => {
    const { token, ...result } = await login(ctx, res.locals.body as LoginInput);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(ctx));
    res.status(200).json(result);
  });

  // 冪等：未登入也回 204；沒有內容，不檢查 Content-Type（contracts/api.md）
  router.post("/logout", (req, res) => {
    logout(ctx, req.signedCookies?.[SESSION_COOKIE]);
    clearSessionCookie(ctx, res);
    res.status(204).end();
  });

  router.get("/me", requireAuth(ctx), (_req, res) => {
    res.json({ user: toCurrentUser(getAuth(res).user) });
  });

  router.post("/password", requireAuth(ctx), validate({ body: changePasswordInput }), async (_req, res) => {
    await changePassword(ctx, getAuth(res), res.locals.body as ChangePasswordInput);
    res.status(204).end();
  });

  return router;
}
