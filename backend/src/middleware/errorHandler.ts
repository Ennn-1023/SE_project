import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCodes, INTERNAL_ERROR_MESSAGE } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

/** ErrorHandler（組件圖中介層）：所有錯誤轉為一致格式（FR-002），未預期錯誤只寫入遮罩後的 log。 */
export function errorHandler(logger: Logger) {
  // Express 以參數數量（4 個）辨識錯誤處理中介層
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json(err.toBody());
      return;
    }
    const e = err as { type?: string; status?: number };
    if (e?.type === 'entity.parse.failed') {
      const appErr = new AppError(ErrorCodes.VALIDATION_ERROR, '送出的資料不是有效的 JSON', {
        hint: '請確認資料格式後再試一次',
      });
      res.status(appErr.status).json(appErr.toBody());
      return;
    }
    if (e?.type === 'entity.too.large') {
      const appErr = new AppError(ErrorCodes.VALIDATION_ERROR, '送出的資料過大', {
        hint: '請減少資料內容後再試一次',
      });
      res.status(appErr.status).json(appErr.toBody());
      return;
    }
    logger.error('unhandled error', {
      method: req.method,
      path: req.path,
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : String(err),
    });
    res
      .status(500)
      .json({ error: { code: ErrorCodes.INTERNAL_ERROR, message: INTERNAL_ERROR_MESSAGE } });
  };
}

/** 未定義的 /api 路徑回 404（一致格式）。 */
export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(
    new AppError(ErrorCodes.NOT_FOUND, '找不到這個功能', {
      hint: '請確認網址是否正確',
    }),
  );
}
