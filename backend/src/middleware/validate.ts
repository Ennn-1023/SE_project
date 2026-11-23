import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

type ZodIssue = z.core.$ZodIssue;
import { AppError, ErrorCodes } from '../lib/errors.js';

/** 在 zod 錯誤訊息中以此分隔「訊息」與「修正提示」。 */
export const HINT_SEPARATOR = '||';

/** 產生帶修正提示的驗證訊息：`msg('學號格式不正確', '學號須為…')`。 */
export const msg = (message: string, hint?: string) =>
  hint ? `${message}${HINT_SEPARATOR}${hint}` : message;

/**
 * 欄位缺漏與型別錯誤的訊息（zod 4 以 `error` 參數取代 zod 3 的 required_error／invalid_type_error）。
 * 輸入為 undefined 時回傳 required，其餘型別錯誤回傳 invalid。
 */
export const fieldError = (required: string, invalid: string = required) => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? required : invalid),
});

export function issueToAppError(issue: ZodIssue): AppError {
  const [message, hint] = issue.message.split(HINT_SEPARATOR);
  const field = issue.path.length > 0 ? issue.path.map(String).join('.') : undefined;
  return new AppError(ErrorCodes.VALIDATION_ERROR, message, { field, hint });
}

interface ValidateSchemas {
  body?: z.ZodType;
  params?: z.ZodType;
  /** 驗證失敗時附加到 error.details 的補充資料（例如最新組數）。 */
  details?: () => Record<string, unknown>;
}

/** Validate（組件圖中介層）：在進入點以 zod 驗證 body／params，失敗回 400（憲章原則 I）。 */
export function validate(schemas: ValidateSchemas) {
  const fail = (issue: ZodIssue) => {
    const err = issueToAppError(issue);
    if (!schemas.details) return err;
    return new AppError(err.code, err.message, {
      field: err.field,
      hint: err.hint,
      details: schemas.details(),
    });
  };
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.params) {
      const parsed = schemas.params.safeParse(req.params);
      if (!parsed.success) return next(fail(parsed.error.issues[0]));
      req.params = parsed.data as Request['params'];
    }
    if (schemas.body) {
      const parsed = schemas.body.safeParse(req.body ?? {});
      if (!parsed.success) return next(fail(parsed.error.issues[0]));
      req.body = parsed.data;
    }
    next();
  };
}

const hasBody = (req: Request) =>
  (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0') ||
  req.headers['transfer-encoding'] !== undefined;

/** 變更請求若帶有內容，必須是 JSON（research R5 CSRF 防護），否則回 415。 */
export function requireJson(req: Request, _res: Response, next: NextFunction) {
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
    hasBody(req) &&
    !req.is('application/json')
  ) {
    return next(
      new AppError(ErrorCodes.UNSUPPORTED_MEDIA, '請以 JSON 格式送出資料', {
        hint: '請將 Content-Type 設為 application/json',
      }),
    );
  }
  next();
}
