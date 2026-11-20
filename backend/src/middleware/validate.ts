import type { RequestHandler } from "express";
import type { z } from "zod";
import { toFieldErrors, type FieldError } from "@se/shared";
import { errors } from "../lib/errors.js";

/**
 * 在系統邊界驗證輸入（憲章原則 I）。驗證後的資料放在 res.locals.body / res.locals.params。
 * 一次回傳所有出錯欄位。
 */
export function validate(schemas: { body?: z.ZodType; params?: z.ZodType }): RequestHandler {
  return (req, res, next) => {
    const details: FieldError[] = [];
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) res.locals.params = result.data;
      else details.push(...toFieldErrors(result.error));
    }
    if (schemas.body) {
      const body: unknown = req.body ?? {};
      const result = schemas.body.safeParse(body);
      if (result.success) res.locals.body = result.data;
      else details.push(...toFieldErrors(result.error));
    }
    if (details.length > 0) {
      next(errors.validation(details));
      return;
    }
    next();
  };
}
