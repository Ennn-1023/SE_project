/**
 * GoogleOAuthClient 與 SheetsGateway 共用的 HTTP 工具（plan.md 基礎設施允許清單）：
 * 15 秒逾時（FR-010）與 Google 錯誤 → AppError 對應（research R2）。
 * Google 回應原文只以摘要寫入 log，不回傳前端（憲章原則 II）。
 */
import { AppError, appError, type ErrorCode } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const GOOGLE_TIMEOUT_MS = 15_000;

export interface GoogleHttpOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
}

/** Google 回應非 2xx、逾時或網路錯誤（status 0）。 */
export class GoogleHttpError extends Error {
  constructor(
    readonly status: number,
    /** Google 的錯誤狀態（例如 PERMISSION_DENIED、invalid_grant）或 TIMEOUT／NETWORK */
    readonly reason: string,
    message = `Google HTTP ${status} ${reason}`,
    /** Google 錯誤訊息原文（只用於判斷錯誤種類，不回傳前端、不寫入 log） */
    readonly googleMessage = '',
  ) {
    super(message);
    this.name = 'GoogleHttpError';
  }
}

function googleMessageOf(body: unknown): string {
  if (body && typeof body === 'object') {
    const err = (body as { error?: unknown }).error;
    if (err && typeof err === 'object') {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }
  return '';
}

function reasonOf(body: unknown): string {
  if (body && typeof body === 'object') {
    const err = (body as { error?: unknown }).error;
    if (typeof err === 'string') return err; // OAuth：{ error: 'invalid_grant' }
    if (err && typeof err === 'object') {
      const status = (err as { status?: unknown }).status;
      if (typeof status === 'string') return status;
    }
  }
  return 'UNKNOWN';
}

export async function googleFetch(
  url: string,
  init: RequestInit = {},
  options: GoogleHttpOptions = {},
): Promise<unknown> {
  const fetchImpl = options.fetch ?? ((u, i) => fetch(u, i));
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? GOOGLE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch {
    throw new GoogleHttpError(0, timedOut ? 'TIMEOUT' : 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text().catch(() => '');
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    throw new GoogleHttpError(res.status, reasonOf(body), undefined, googleMessageOf(body));
  }
  return body;
}

/** 依 research R2 表格把 Google 錯誤轉為對使用者清楚、不含原文的 AppError。 */
export function mapGoogleError(err: unknown, phase: 'read' | 'write', logger?: Logger): AppError {
  if (err instanceof AppError) return err;
  let code: ErrorCode = 'GOOGLE_UNAVAILABLE';
  if (err instanceof GoogleHttpError) {
    if (err.status === 401 || err.reason === 'invalid_grant') code = 'GOOGLE_AUTH_EXPIRED';
    else if (err.status === 403 && phase === 'write' && /protected/i.test(err.googleMessage))
      code = 'SHEET_PROTECTED_RANGE'; // 005 research R7：寫入受保護範圍
    else if (err.status === 403)
      code = phase === 'write' ? 'SHEET_NO_EDIT_PERMISSION' : 'SHEET_FORBIDDEN';
    else if (err.status === 404) code = 'SHEET_NOT_FOUND';
    else if (err.status === 429) code = 'GOOGLE_RATE_LIMITED';
    // 上傳到雲端硬碟的 Excel（.xlsx）等非原生檔案：Sheets API 回 400 FAILED_PRECONDITION
    else if (err.status === 400 && err.reason === 'FAILED_PRECONDITION') code = 'SHEET_NOT_NATIVE';
    logger?.warn('google request failed', { status: err.status, reason: err.reason, phase });
  } else {
    logger?.error('google request error', { name: (err as Error)?.name ?? 'unknown', phase });
  }
  return appError(code);
}
