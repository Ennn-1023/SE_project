# Data Model: 登入與身分驗證／權限控管（F1）

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

儲存：SQLite（Node 內建 `node:sqlite`）。資料表名稱為 `users`、`sessions`、`security_events`，欄位為下表名稱的 snake_case。時間一律存 UTC。

---

## User（使用者帳號）

| 欄位 | 型別 | 必填 | 規則 / 說明 |
|------|------|------|-------------|
| `id` | string (UUID) | 是 | 主鍵 |
| `username` | string | 是 | **UNIQUE**。學生＝9 位半形數字學號（`^[0-9]{9}$`，保留開頭 0）；老師＝`TEACHER_USERNAME`（1–20 字元、無空白、不可為 9 位數字） |
| `displayName` | string | 是 | 去除前後空白後 1–50 字元；老師預設為「老師」 |
| `role` | enum `TEACHER` \| `STUDENT` | 是 | 建立時設定，之後不可變更；**所有導向與權限判斷只依此欄位**（FR-012） |
| `groupLabel` | string \| null | 否 | 只有學生可有；去除前後空白後 1–20 字元；空字串視為 null。供 F2 使用 |
| `passwordHash` | string | 是 | `scrypt$N$r$p$salt$hash`；**永不出現在任何 API 回應或 log** |
| `usesDefaultPassword` | boolean | 是 | 學生：新增／重設時 `true`，自行改密碼後 `false`。老師：初始化時 `true` |
| `passwordChangedAt` | datetime | 是 | 建立、改密碼、重設時更新 |
| `createdById` | string \| null | 否 | 建立此帳號的老師 `User.id`；老師帳號為 null（由初始化建立） |
| `createdAt` | datetime | 是 | |

**規則**

- 新增學生時 `username` 已存在 → 409 `ACCOUNT_EXISTS`（資料庫 UNIQUE 約束保證，兩個同時的請求只會有一個成功）。
- 刪除學生：實際刪除資料列，並連帶刪除其所有 `Session`（cascade）。刪除後同一學號可再次新增。
- 學生帳號管理 API 只作用於 `role = STUDENT` 的資料列；對老師帳號操作一律回 404 `STUDENT_NOT_FOUND`。
- 初始化：`role = TEACHER` 的帳號數為 0 時才建立老師帳號。

**狀態（學生密碼）**

```text
[新增] ──> 預設密碼 (usesDefaultPassword=true)
預設密碼 ──學生改密碼──> 自訂密碼 (usesDefaultPassword=false)
自訂密碼 ──學生改密碼──> 自訂密碼
任何狀態 ──老師重設──> 預設密碼（並刪除該學生所有 Session）
任何狀態 ──老師刪除──> [不存在]（並刪除該學生所有 Session）
```

## Session（登入狀態）

| 欄位 | 型別 | 必填 | 規則 / 說明 |
|------|------|------|-------------|
| `id` | string (UUID) | 是 | 主鍵 |
| `tokenHash` | string | 是 | **UNIQUE**。cookie 中隨機 token 的 SHA-256；不存原始 token |
| `userId` | string | 是 | FK → `User.id`，**ON DELETE CASCADE** |
| `createdAt` | datetime | 是 | 登入時間 |
| `lastSeenAt` | datetime | 是 | 最後活動時間；最多每 60 秒更新一次 |
| `expiresAt` | datetime | 是 | `createdAt + 12 小時`（絕對上限） |

**有效條件**（每個受保護請求都檢查）：資料列存在 且 `now < expiresAt` 且 `now - lastSeenAt < 2 小時`。不符合即刪除該 session 並回 401 `SESSION_EXPIRED`。

**失效事件**

| 事件 | 影響的 Session |
|------|----------------|
| 登出 | 目前這一筆 |
| 學生／老師自行改密碼 | 該帳號**除了目前這筆以外**的所有 session（FR-020） |
| 老師重設學生密碼 | 該學生的所有 session（FR-019） |
| 老師刪除學生 | 該學生的所有 session（cascade） |
| 閒置 2 小時／登入滿 12 小時 | 該筆（請求時檢查到即刪除） |

## SecurityEvent（安全事件紀錄）

| 欄位 | 型別 | 必填 | 規則 / 說明 |
|------|------|------|-------------|
| `id` | string (UUID) | 是 | 主鍵 |
| `type` | enum | 是 | `LOGIN_SUCCESS`、`LOGIN_FAILURE`、`LOGOUT`、`PASSWORD_CHANGED`、`PASSWORD_RESET`、`STUDENT_CREATED`、`STUDENT_DELETED` |
| `actorUsername` | string \| null | 否 | 執行者（登入失敗時為**嘗試的帳號名稱**，截斷至 20 字元） |
| `targetUsername` | string \| null | 否 | 被操作的學生學號（新增／刪除／重設時） |
| `occurredAt` | datetime | 是 | |

- **不含**密碼、token、cookie 或任何雜湊（FR-024、憲章原則 III）。
- 不使用外鍵（帳號刪除後紀錄仍保留以供查核）。

## 輸入驗證規則總表（shared/ zod schema）

| Schema | 欄位 | 規則 | 錯誤 code |
|--------|------|------|-----------|
| `loginInput` | `username` | 去除前後空白；1–20 字元；不含空白 | `VALIDATION_ERROR`（field=`username`） |
| | `password` | 1–64 字元；**不修剪** | `VALIDATION_ERROR`（field=`password`） |
| `createStudentInput` | `studentId` | 去除前後空白；`^[0-9]{9}$`（全形數字不接受） | `VALIDATION_ERROR`（field=`studentId`） |
| | `name` | 去除前後空白；1–50 字元 | `VALIDATION_ERROR`（field=`name`） |
| | `group` | 選填；去除前後空白；0–20 字元（空＝無組別） | `VALIDATION_ERROR`（field=`group`） |
| `changePasswordInput` | `currentPassword` | 1–64 字元 | `VALIDATION_ERROR` |
| | `newPassword` | 8–64 字元；≠ `STUDENT_DEFAULT_PASSWORD`（伺服器端檢查） | `VALIDATION_ERROR` / `PASSWORD_IS_DEFAULT` |
| | `confirmPassword` | 必須等於 `newPassword` | `VALIDATION_ERROR`（field=`confirmPassword`） |
| 路徑參數 | `:studentId` | `^[0-9]{9}$` | `VALIDATION_ERROR` |

- 請求 body 上限 10 KB；超過回 413 `PAYLOAD_TOO_LARGE`（擋下 10,000 字元等超長輸入）。
- 驗證失敗一次回傳**所有**欄位錯誤（`details` 陣列），不只第一個。
