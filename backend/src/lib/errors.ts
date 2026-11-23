/** AppError 與錯誤碼（research R9、contracts/openapi.yaml ErrorResponse）。 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  STUDENT_EXISTS: 'STUDENT_EXISTS',
  ALREADY_ASSIGNED: 'ALREADY_ASSIGNED',
  GROUPS_NOT_OPEN: 'GROUPS_NOT_OPEN',
  GROUP_NOT_EMPTY: 'GROUP_NOT_EMPTY',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  UNSUPPORTED_MEDIA: 'UNSUPPORTED_MEDIA',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_CURRENT_PASSWORD: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STUDENT_EXISTS: 409,
  ALREADY_ASSIGNED: 409,
  GROUPS_NOT_OPEN: 409,
  GROUP_NOT_EMPTY: 409,
  ACCOUNT_LOCKED: 423,
  UNSUPPORTED_MEDIA: 415,
  INTERNAL_ERROR: 500,
};

export interface AppErrorOptions {
  field?: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly field?: string;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.field = options.field;
    this.hint = options.hint;
    this.details = options.details;
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.field !== undefined ? { field: this.field } : {}),
        ...(this.hint !== undefined ? { hint: this.hint } : {}),
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

export const INTERNAL_ERROR_MESSAGE = '系統發生錯誤，請稍後再試';
