import type { ErrorRequestHandler, RequestHandler } from 'express';
import { describeError, type ErrorBody, type ErrorCode, type ErrorParams } from '@buzzer/shared';
import { AppError } from '../errors';

export function toErrorBody(
  code: ErrorCode,
  field: string | null = null,
  params: ErrorParams = {},
): { status: number; body: ErrorBody } {
  const d = describeError(code, params);
  return { status: d.status, body: { error: { code, field, message: d.message, hint: d.hint } } };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  const { status, body } = toErrorBody('NOT_FOUND');
  res.status(status).json(body);
};

/** 統一錯誤格式（憲章原則 II）；不回傳 stack trace，log 不記錄 token 或請求內容 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    const { status, body } = toErrorBody(err.code, err.field, err.params);
    res.status(status).json(body);
    return;
  }
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') {
    const { status, body } = toErrorBody('VALIDATION_ERROR', 'body', {
      message: '請求內容不是合法的 JSON',
      hint: '請以 JSON 格式送出',
    });
    res.status(status).json(body);
    return;
  }
  if (type === 'entity.too.large') {
    const { status, body } = toErrorBody('VALIDATION_ERROR', 'body', {
      message: '請求內容過大',
      hint: '請縮短內容後再送出',
    });
    res.status(status).json(body);
    return;
  }
  console.error(`[error] ${req.method} ${req.path}: ${(err as Error)?.name ?? 'Error'} ${(err as Error)?.message ?? ''}`);
  const { status, body } = toErrorBody('INTERNAL_ERROR');
  res.status(status).json(body);
};
