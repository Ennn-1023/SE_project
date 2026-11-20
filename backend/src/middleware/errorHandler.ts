import type { ErrorRequestHandler } from "express";
import type { Logger } from "../lib/logger.js";
import { AppError, errors } from "../lib/errors.js";

/**
 * 統一錯誤處理（contracts/api.md、憲章原則 II）：
 * 已知錯誤回傳對應狀態碼；未知錯誤回 500，不把 stack trace 或內部訊息交給使用者。
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    let appError: AppError;
    if (error instanceof AppError) {
      appError = error;
    } else if (isBodyParserError(error, "entity.too.large")) {
      appError = errors.payloadTooLarge();
    } else if (isBodyParserError(error, "entity.parse.failed")) {
      appError = errors.validation([
        { field: "body", message: "送出的資料不是有效的 JSON", hint: "請重新整理頁面後再試" },
      ]);
    } else if (isBodyParserError(error, "encoding.unsupported") || isBodyParserError(error, "charset.unsupported")) {
      appError = errors.unsupportedMediaType();
    } else {
      // 只記錄錯誤名稱與訊息；request body 不寫入 log
      logger.error({ err: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) }, "unexpected error");
      appError = errors.internal();
    }
    res.status(appError.status).json({ error: appError.toBody() });
  };
}

function isBodyParserError(error: unknown, type: string): boolean {
  return typeof error === "object" && error !== null && (error as { type?: unknown }).type === type;
}
