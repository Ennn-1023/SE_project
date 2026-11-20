# API Contract: 登入與身分驗證／權限控管（F1）

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

- Base path：`/api`；request／response 皆為 `application/json`（UTF-8）。
- **有內容**的 `POST` 請求（`Content-Length` > 0 或使用 chunked 傳輸）必須帶 `Content-Type: application/json`，否則 415（與 `SameSite=Strict` cookie 一起構成 CSRF 防護）。**沒有內容**的 `POST`（`/api/auth/logout`、`/api/students/:studentId/reset-password`）不檢查 `Content-Type`。前端一律帶 `Content-Type: application/json`。
- 登入狀態以 HttpOnly cookie `sid` 傳遞（簽章、`SameSite=Strict`、`Path=/`；正式環境加 `Secure`）。前端不讀取它。

## 統一錯誤格式

所有 4xx／5xx 回應：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "學號須為 9 位數字",
    "hint": "請輸入半形數字，例如 411000001",
    "details": [
      { "field": "studentId", "message": "學號須為 9 位數字", "hint": "請輸入半形數字，例如 411000001" }
    ]
  }
}
```

- `details` 只在欄位驗證錯誤時出現，列出**所有**出錯欄位。
- 訊息不含密碼、token、stack trace 或內部錯誤；500 一律回 `INTERNAL_ERROR`「系統發生錯誤，請稍後再試」。

| HTTP | code | 何時 |
|------|------|------|
| 400 | `VALIDATION_ERROR` | 欄位格式／必填錯誤 |
| 400 | `PASSWORD_IS_DEFAULT` | 新密碼等於預設密碼 |
| 401 | `INVALID_CREDENTIALS` | 帳號不存在**或**密碼錯誤（訊息一律「學號或密碼錯誤」） |
| 401 | `UNAUTHENTICATED` | 未登入（無 cookie 或 cookie 無效） |
| 401 | `SESSION_EXPIRED` | 閒置 2 小時或登入滿 12 小時（訊息「登入已逾時，請重新登入」） |
| 401 | `WRONG_CURRENT_PASSWORD` | 改密碼時目前密碼錯誤（登入狀態仍有效，前端不得因此登出） |
| 403 | `FORBIDDEN` | 已登入但角色不符（訊息「權限不足」） |
| 404 | `STUDENT_NOT_FOUND` | 學生帳號不存在（訊息「找不到此學生帳號」） |
| 409 | `ACCOUNT_EXISTS` | 新增時帳號名稱已存在（訊息「學號 411000001 已存在」） |
| 413 | `PAYLOAD_TOO_LARGE` | body 超過 10 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 非 JSON |
| 500 | `INTERNAL_ERROR` | 未預期錯誤 |

## 共用物件

```ts
type Role = "TEACHER" | "STUDENT";

interface CurrentUser {
  username: string;            // 學號或老師帳號名稱
  displayName: string;
  role: Role;
  usesDefaultPassword: boolean;
}

interface StudentSummary {
  studentId: string;           // 9 位數字
  name: string;
  group: string | null;
  usesDefaultPassword: boolean;
  createdAt: string;           // ISO 8601
}
```

---

## Auth

### `POST /api/auth/login` — 公開

Request：`{ "username": string, "password": string }`（規則見 data-model）

| 結果 | 回應 |
|------|------|
| 成功 | 200 `{ "user": CurrentUser, "redirectTo": "/teacher" \| "/student" }`，並 `Set-Cookie: sid=...` |
| 欄位錯誤 | 400 `VALIDATION_ERROR` |
| 帳號不存在／密碼錯誤 | 401 `INVALID_CREDENTIALS`（兩者回應內容與耗時相同） |

不限制失敗次數（FR-010）。每次結果寫入 `SecurityEvent`。

### `POST /api/auth/logout` — 需登入

Response：204，清除 cookie，刪除目前 session。未登入時也回 204（冪等）。

### `GET /api/auth/me` — 需登入

| 結果 | 回應 |
|------|------|
| 已登入 | 200 `{ "user": CurrentUser }` |
| 未登入 | 401 `UNAUTHENTICATED` |
| 逾時 | 401 `SESSION_EXPIRED` |

前端用於：開啟登入頁時若已登入則直接導向（FR-011）、重新整理後恢復狀態、路由守衛。

### `POST /api/auth/password` — 需登入（老師或學生）

Request：`{ "currentPassword": string, "newPassword": string, "confirmPassword": string }`

| 結果 | 回應 |
|------|------|
| 成功 | 204；`usesDefaultPassword=false`；刪除該帳號**其他**所有 session，目前 session 保留 |
| 欄位錯誤／兩次不一致 | 400 `VALIDATION_ERROR` |
| 新密碼等於預設密碼 | 400 `PASSWORD_IS_DEFAULT` |
| 目前密碼錯誤 | 401 `WRONG_CURRENT_PASSWORD` |

---

## Students（全部限老師；學生呼叫回 403 `FORBIDDEN`，未登入回 401）

### `GET /api/students`

Response：200 `{ "students": StudentSummary[] }`，依學號遞增排序。不含任何密碼資訊。

### `POST /api/students`

Request：`{ "studentId": string, "name": string, "group"?: string }`

| 結果 | 回應 |
|------|------|
| 成功 | 201 `{ "student": StudentSummary }`（密碼＝預設密碼，`usesDefaultPassword=true`） |
| 欄位錯誤 | 400 `VALIDATION_ERROR`（列出所有錯誤欄位） |
| 帳號名稱已存在（含與老師帳號同名） | 409 `ACCOUNT_EXISTS`，既有帳號不變 |

### `DELETE /api/students/:studentId`

前端必須先顯示確認對話框（取消則不送出請求）。

| 結果 | 回應 |
|------|------|
| 成功 | 204；帳號與其所有 session 刪除 |
| 學號格式錯誤 | 400 `VALIDATION_ERROR` |
| 不存在、已刪除或為老師帳號 | 404 `STUDENT_NOT_FOUND` |

### `POST /api/students/:studentId/reset-password`

前端必須先顯示確認對話框。

| 結果 | 回應 |
|------|------|
| 成功 | 204；密碼恢復預設、`usesDefaultPassword=true`、刪除該學生所有 session |
| 學號格式錯誤 | 400 `VALIDATION_ERROR` |
| 不存在或為老師帳號 | 404 `STUDENT_NOT_FOUND` |

---

## 前端路由（UI contract）

| 路徑 | 可進入者 | 未登入 | 角色不符 |
|------|----------|--------|----------|
| `/login` | 所有人；已登入者自動導向自己的首頁 | — | — |
| `/teacher` | 老師（管理首頁） | 導向 `/login` | 導向 `/student` |
| `/teacher/students` | 老師（學生帳號清單、新增、刪除、重設） | 導向 `/login` | 導向 `/student` |
| `/student` | 學生（搶答頁；本功能先顯示等待畫面與「建議修改密碼」提示） | 導向 `/login` | 導向 `/teacher` |
| `/account/password` | 老師與學生 | 導向 `/login` | — |

前端只在 API 回 401 且 `code` 為 `UNAUTHENTICATED` 或 `SESSION_EXPIRED` 時，清除目前使用者並導向 `/login`；`SESSION_EXPIRED` 時在登入頁顯示「登入已逾時，請重新登入」。`INVALID_CREDENTIALS`（登入失敗）與 `WRONG_CURRENT_PASSWORD`（改密碼時目前密碼錯誤）雖然也是 401，但**不代表登入狀態失效**，前端 MUST 留在原頁面顯示錯誤訊息，不得登出或跳頁。
