import { ErrorCode, SESSION_INVALID_CODES, isErrorResponse, type ErrorBody, type FieldError } from "@se/shared";

/** API 呼叫失敗時拋出的錯誤，保留後端統一錯誤格式的內容。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly details: FieldError[];

  constructor(status: number, body: ErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.hint = body.hint;
    this.details = body.details ?? [];
  }

  /** 取得某欄位的錯誤訊息（供表單顯示）。 */
  fieldMessage(field: string): string | undefined {
    return this.details.find((d) => d.field === field)?.message;
  }
}

type SessionInvalidHandler = (code: ErrorCode) => void;
let sessionInvalidHandler: SessionInvalidHandler | undefined;

/** AuthProvider 註冊：登入狀態失效時清除使用者並導向 /login。 */
export function setSessionInvalidHandler(handler: SessionInvalidHandler | undefined): void {
  sessionInvalidHandler = handler;
}

export interface RequestOptions {
  /** true 時即使登入狀態失效也不觸發導向（例如啟動時查詢 /me）。 */
  silent?: boolean;
}

/**
 * fetch 包裝（contracts/api.md「前端路由」）：
 * 只有 401 且 code 為 UNAUTHENTICATED 或 SESSION_EXPIRED 時才觸發登出導向；
 * INVALID_CREDENTIALS、WRONG_CURRENT_PASSWORD 等其他 401 交給呼叫端在原頁面顯示。
 */
export async function apiRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, {
      code: ErrorCode.INTERNAL_ERROR,
      message: "無法連線到伺服器",
      hint: "請確認網路連線後再試",
    });
  }

  if (response.status === 204) return undefined as T;

  let data: unknown = undefined;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (response.ok) return data as T;

  const errorBody: ErrorBody = isErrorResponse(data)
    ? data.error
    : { code: ErrorCode.INTERNAL_ERROR, message: "系統發生錯誤，請稍後再試", hint: "若持續發生請通知老師" };
  const error = new ApiError(response.status, errorBody);

  if (response.status === 401 && SESSION_INVALID_CODES.includes(error.code) && !options.silent) {
    sessionInvalidHandler?.(error.code);
  }
  throw error;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiRequest<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>("POST", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>("DELETE", path, undefined, options),
};
