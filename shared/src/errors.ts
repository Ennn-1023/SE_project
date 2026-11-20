/**
 * 統一錯誤格式與錯誤 code（contracts/api.md「統一錯誤格式」）。
 */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PASSWORD_IS_DEFAULT: "PASSWORD_IS_DEFAULT",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  WRONG_CURRENT_PASSWORD: "WRONG_CURRENT_PASSWORD",
  FORBIDDEN: "FORBIDDEN",
  STUDENT_NOT_FOUND: "STUDENT_NOT_FOUND",
  ACCOUNT_EXISTS: "ACCOUNT_EXISTS",
  NOT_FOUND: "NOT_FOUND",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface FieldError {
  field: string;
  message: string;
  hint?: string;
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  hint?: string;
  details?: FieldError[];
}

export interface ErrorResponse {
  error: ErrorBody;
}

/** 代表「登入狀態已失效」的 401 code；只有這些 code 才讓前端登出（contracts/api.md）。 */
export const SESSION_INVALID_CODES: readonly ErrorCode[] = [
  ErrorCode.UNAUTHENTICATED,
  ErrorCode.SESSION_EXPIRED,
];

export function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}
