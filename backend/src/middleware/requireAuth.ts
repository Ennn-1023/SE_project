import type { CookieOptions, RequestHandler, Response } from "express";
import type { AppContext } from "../context.js";
import type { UserRow } from "../db/users.js";
import { errors } from "../lib/errors.js";
import { ABSOLUTE_TIMEOUT_MS, resolveSession } from "../services/sessionService.js";

export const SESSION_COOKIE = "sid";

export function sessionCookieOptions(ctx: AppContext): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: ctx.env.NODE_ENV === "production",
    signed: true,
    path: "/",
    maxAge: ABSOLUTE_TIMEOUT_MS,
  };
}

export function clearSessionCookie(ctx: AppContext, res: Response): void {
  // 清除時不可簽章，否則 Express 會寫入簽過章的空值
  const { maxAge: _maxAge, signed: _signed, ...options } = sessionCookieOptions(ctx);
  res.clearCookie(SESSION_COOKIE, options);
}

export interface AuthInfo {
  user: UserRow;
  sessionId: string;
}

export function getAuth(res: Response): AuthInfo {
  const auth = res.locals.auth as AuthInfo | undefined;
  if (!auth) throw errors.unauthenticated();
  return auth;
}

/** 讀取簽章 cookie 並檢查 session（spec FR-012、FR-013、FR-016）。 */
export function requireAuth(ctx: AppContext): RequestHandler {
  return (req, res, next) => {
    const token: unknown = req.signedCookies?.[SESSION_COOKIE];
    // 未帶 cookie 為 undefined；簽章不符（竄改）時 cookie-parser 會給 false
    if (typeof token !== "string" || token.length === 0) {
      if (token === false) clearSessionCookie(ctx, res);
      next(errors.unauthenticated());
      return;
    }
    const result = resolveSession(ctx, token);
    if (result.status === "expired") {
      clearSessionCookie(ctx, res);
      next(errors.sessionExpired());
      return;
    }
    if (result.status === "invalid") {
      clearSessionCookie(ctx, res);
      next(errors.unauthenticated());
      return;
    }
    res.locals.auth = { user: result.user, sessionId: result.session.id } satisfies AuthInfo;
    next();
  };
}
