import type { ErrorBody } from '@buzzer/shared';

/** 伺服器回傳的錯誤（contracts/rest-api.md 錯誤格式） */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly field: string | null,
    message: string,
    public readonly hint: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const NETWORK_ERROR = 'NETWORK_ERROR';

/** fetch 包裝：以同源的 session cookie 登入（001 F1），錯誤時拋出 ApiError */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      credentials: 'same-origin',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR, null, '無法連線到伺服器', '請檢查網路後再試一次');
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.field ?? null,
      err?.message ?? '系統發生錯誤，請稍後再試',
      err?.hint ?? '',
    );
  }
  return data as T;
}
