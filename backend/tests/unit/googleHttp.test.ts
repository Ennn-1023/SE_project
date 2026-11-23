import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GoogleHttpError,
  googleFetch,
  mapGoogleError,
} from '../../src/integrations/google/googleHttp.js';
import { AppError } from '../../src/lib/errors.js';

const TOKEN = 'fake-access-token-xyz';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Google 錯誤回應的虛構範例（含 token 字樣，用來確認不會外洩）。 */
const googleErrorBody = (status: string) => ({
  error: { code: 0, status, message: `raw google message with ${TOKEN}` },
});

/** 取得 Promise 的拒絕原因（型別為 GoogleHttpError）。 */
function rejection(p: Promise<unknown>): Promise<GoogleHttpError> {
  return p.then(
    () => {
      throw new Error('expected rejection');
    },
    (e: unknown) => e as GoogleHttpError,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('googleFetch', () => {
  it('2xx 回傳解析後的 JSON（正常）', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: 1 }));
    await expect(googleFetch('https://x/y', {}, { fetch: fetchImpl })).resolves.toEqual({ ok: 1 });
  });

  it('204 或空內容回傳 null', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(googleFetch('https://x/y', {}, { fetch: fetchImpl })).resolves.toBeNull();
  });

  it('非 2xx 丟 GoogleHttpError（含狀態與 Google 狀態碼）', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(403, googleErrorBody('PERMISSION_DENIED')));
    const err = await rejection(googleFetch('https://x/y', {}, { fetch: fetchImpl }));
    expect(err).toBeInstanceOf(GoogleHttpError);
    expect(err.status).toBe(403);
    expect(err.reason).toBe('PERMISSION_DENIED');
  });

  it('網路錯誤 → GoogleHttpError(status 0)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await rejection(googleFetch('https://x/y', {}, { fetch: fetchImpl }));
    expect(err).toBeInstanceOf(GoogleHttpError);
    expect(err.status).toBe(0);
  });

  it('超過 15 秒逾時 → GoogleHttpError(status 0, TIMEOUT)（邊界，FR-010）', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = rejection(googleFetch('https://x/y', {}, { fetch: fetchImpl }));
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    const err = await pending;
    expect(err).toBeInstanceOf(GoogleHttpError);
    expect(err.status).toBe(0);
    expect(err.reason).toBe('TIMEOUT');
  });
});

describe('mapGoogleError（research R2 表格）', () => {
  it.each([
    [401, 'read', 'GOOGLE_AUTH_EXPIRED', 409],
    [403, 'read', 'SHEET_FORBIDDEN', 403],
    [403, 'write', 'SHEET_NO_EDIT_PERMISSION', 403],
    [404, 'read', 'SHEET_NOT_FOUND', 404],
    [429, 'read', 'GOOGLE_RATE_LIMITED', 503],
    [500, 'read', 'GOOGLE_UNAVAILABLE', 503],
    [503, 'write', 'GOOGLE_UNAVAILABLE', 503],
    [0, 'read', 'GOOGLE_UNAVAILABLE', 503],
    [400, 'read', 'GOOGLE_UNAVAILABLE', 503],
  ] as const)('HTTP %i（%s）→ %s', (status, phase, code, httpStatus) => {
    const err = mapGoogleError(new GoogleHttpError(status, 'X', `detail ${TOKEN}`), phase);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(code);
    expect(err.status).toBe(httpStatus);
    expect(err.hint).toBeTruthy();
    // 不洩漏 Google 原文與 token（憲章原則 II）
    expect(JSON.stringify(err.toBody())).not.toContain(TOKEN);
    expect(JSON.stringify(err.toBody())).not.toContain('detail');
  });

  it('400 FAILED_PRECONDITION（上傳的 Excel 等非原生試算表）→ 422 SHEET_NOT_NATIVE，說明如何轉檔', () => {
    const err = mapGoogleError(new GoogleHttpError(400, 'FAILED_PRECONDITION'), 'read');
    expect(err.code).toBe('SHEET_NOT_NATIVE');
    expect(err.status).toBe(422);
    expect(err.message).toBe('這個檔案不是 Google 試算表格式（可能是上傳的 Excel 檔）');
    expect(err.hint).toContain('儲存為 Google 試算表');
  });

  it('已是 AppError 時原樣回傳', () => {
    const original = new AppError('SHEET_EMPTY', '這個分頁是空的');
    expect(mapGoogleError(original, 'read')).toBe(original);
  });

  it('未知錯誤 → GOOGLE_UNAVAILABLE', () => {
    expect(mapGoogleError(new Error('boom'), 'read').code).toBe('GOOGLE_UNAVAILABLE');
  });
});
