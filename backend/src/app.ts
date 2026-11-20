import express, { type Express, type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import type { AppContext } from "./context.js";
import { errors } from "./lib/errors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { studentsRouter } from "./routes/students.js";

export const BODY_LIMIT = "10kb";

/**
 * 有內容的 POST 必須是 application/json，否則 415；沒有內容的 POST（登出、重設密碼）不檢查
 * （contracts/api.md 開頭規則）。
 */
const requireJsonBody: RequestHandler = (req, _res, next) => {
  if (req.method !== "POST") return next();
  const length = Number(req.headers["content-length"] ?? 0);
  const hasBody = length > 0 || req.headers["transfer-encoding"] !== undefined;
  if (hasBody && !req.is("application/json")) return next(errors.unsupportedMediaType());
  next();
};

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");

  app.use("/api", requireJsonBody);
  app.use("/api", express.json({ limit: BODY_LIMIT }));
  app.use("/api", cookieParser(ctx.env.SESSION_SECRET));

  app.use("/api/auth", authRouter(ctx));
  app.use("/api/students", studentsRouter(ctx));
  app.use("/api", (_req, _res, next) => next(errors.notFound()));

  app.use(errorHandler(ctx.logger));
  return app;
}
