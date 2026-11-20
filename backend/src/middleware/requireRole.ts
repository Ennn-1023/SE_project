import type { RequestHandler } from "express";
import type { Role } from "@se/shared";
import { errors } from "../lib/errors.js";
import { getAuth } from "./requireAuth.js";

/** 只依資料庫記錄的身分類別判斷（data-model.md User.role、spec FR-012），不看帳號名稱格式。 */
export function requireRole(role: Role): RequestHandler {
  return (_req, res, next) => {
    const { user } = getAuth(res);
    if (user.role !== role) {
      next(errors.forbidden());
      return;
    }
    next();
  };
}
