import { ErrorCode, type ErrorBody, type FieldError } from "@se/shared";

/** 已知錯誤：由 errorHandler 轉成統一錯誤格式（contracts/api.md）。 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly hint?: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = "AppError";
  }

  toBody(): ErrorBody {
    const body: ErrorBody = { code: this.code, message: this.message };
    if (this.hint) body.hint = this.hint;
    if (this.details) body.details = this.details;
    return body;
  }
}

export const errors = {
  validation: (details: FieldError[]) => {
    const first = details[0];
    return new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      first?.message ?? "輸入資料格式錯誤",
      first?.hint ?? "請依欄位提示修正後再送出",
      details,
    );
  },
  invalidCredentials: () =>
    new AppError(
      401,
      ErrorCode.INVALID_CREDENTIALS,
      "學號或密碼錯誤",
      "請確認學號與密碼後再試一次；忘記密碼請洽老師重設",
    ),
  unauthenticated: () =>
    new AppError(401, ErrorCode.UNAUTHENTICATED, "尚未登入", "請先登入後再操作"),
  sessionExpired: () =>
    new AppError(401, ErrorCode.SESSION_EXPIRED, "登入已逾時，請重新登入", "請重新輸入學號與密碼登入"),
  wrongCurrentPassword: () =>
    new AppError(
      401,
      ErrorCode.WRONG_CURRENT_PASSWORD,
      "目前密碼錯誤",
      "請輸入你現在用來登入的密碼",
      [{ field: "currentPassword", message: "目前密碼錯誤", hint: "請輸入你現在用來登入的密碼" }],
    ),
  passwordIsDefault: () =>
    new AppError(
      400,
      ErrorCode.PASSWORD_IS_DEFAULT,
      "新密碼不得與預設密碼相同",
      "請設定一組只有你知道的新密碼",
      [
        {
          field: "newPassword",
          message: "新密碼不得與預設密碼相同",
          hint: "請設定一組只有你知道的新密碼",
        },
      ],
    ),
  forbidden: () =>
    new AppError(403, ErrorCode.FORBIDDEN, "權限不足", "此功能只有老師可以使用"),
  studentNotFound: () =>
    new AppError(404, ErrorCode.STUDENT_NOT_FOUND, "找不到此學生帳號", "請重新整理學生清單後再試"),
  accountExists: (username: string) =>
    new AppError(
      409,
      ErrorCode.ACCOUNT_EXISTS,
      `學號 ${username} 已存在`,
      "此學號已有帳號；若資料有誤請先刪除再重新新增",
      [{ field: "studentId", message: `學號 ${username} 已存在` }],
    ),
  notFound: () =>
    new AppError(404, ErrorCode.NOT_FOUND, "找不到此 API", "請確認網址是否正確"),
  payloadTooLarge: () =>
    new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, "送出的資料過大", "請縮短輸入內容後再試"),
  unsupportedMediaType: () =>
    new AppError(
      415,
      ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      "不支援的資料格式",
      "請以 Content-Type: application/json 送出",
    ),
  internal: () =>
    new AppError(500, ErrorCode.INTERNAL_ERROR, "系統發生錯誤，請稍後再試", "若持續發生請通知老師"),
};
