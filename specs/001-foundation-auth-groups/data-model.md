# Data Model: 基礎建設、登入權限與組別管理（F0／F1／F2）

**Feature**: [spec.md](spec.md) | **Class diagram**: [`diagrams/001-class.puml`](../../diagrams/001-class.puml) | **Date**: 2026-11-22

儲存於 SQLite（見 [research.md](research.md) R3）。時間欄位一律以 UTC ISO-8601 字串（`TEXT`）儲存。

## 實體與資料表對照

| 類別圖元素 | 資料表 | 說明 |
|-----------|--------|------|
| `User`／`Teacher`／`Student`、`Role` | `users` | 單表繼承，以 `role` 區分 |
| `Session` | `sessions` | 每個裝置的一次登入 |
| `GroupSettings` | `group_settings` | 單列設定（`id = 1`） |
| `GroupSummary` | （無，查詢時由 `users` 彙總） | 依 `group_number` 分組 |
| `CreateStudentInput`、`AppError` | （無，僅存在於請求／回應） | |
| — | `schema_migrations` | migration 版本紀錄 |

---

## users

| 欄位 | 型別 | 約束 | 對應 |
|------|------|------|------|
| `id` | INTEGER | PK AUTOINCREMENT | `User.id` |
| `account` | TEXT | NOT NULL, UNIQUE；已正規化（去除前後空白、轉大寫） | `User.account`、`Student.studentId` |
| `display_name` | TEXT | NOT NULL, 1–50 字元 | `User.displayName` |
| `role` | TEXT | NOT NULL, `CHECK (role IN ('TEACHER','STUDENT'))` | `User.role` |
| `password_hash` | TEXT | NOT NULL（bcrypt） | `User.passwordHash` |
| `using_default_password` | INTEGER | NOT NULL, 0/1 | `User.usingDefaultPassword` |
| `group_number` | INTEGER | NULL = 未分配；`CHECK (group_number IS NULL OR group_number >= 1)`；`CHECK (role = 'STUDENT' OR group_number IS NULL)` | `Student.groupNumber` |
| `failed_login_count` | INTEGER | NOT NULL DEFAULT 0 | `User.failedLoginCount` |
| `failed_window_started_at` | TEXT | NULL | `User.failedWindowStartedAt` |
| `locked_until` | TEXT | NULL | `User.lockedUntil` |
| `created_at` | TEXT | NOT NULL | `User.createdAt` |
| `updated_at` | TEXT | NOT NULL | |

**索引**：`UNIQUE(account)`；`INDEX(role, group_number)`（組別總覽與調降組數查詢）。

**驗證規則**（於系統邊界以 zod 執行，見 [contracts/openapi.yaml](contracts/openapi.yaml)）：

| 欄位 | 規則 | 來源 |
|------|------|------|
| 學號（`account` of STUDENT） | 去除前後空白後 `^[A-Za-z0-9]{4,20}$`，存入前轉大寫 | FR-015 |
| 姓名（`display_name`） | 去除前後空白後 1–50 字元 | FR-015 |
| 新密碼 | ≥ 8 字元、≤ 64 字元、≠ 預設密碼、兩次輸入一致 | FR-024 |
| 組別編號 | 整數且 1 ≤ g ≤ 目前組數 N；老師指派可為 `null` | FR-034、FR-036、FR-040 |

## sessions

| 欄位 | 型別 | 約束 | 對應 |
|------|------|------|------|
| `id` | TEXT | PK；`HMAC-SHA256(SESSION_SECRET, token)` 的 hex | `Session.id` |
| `user_id` | INTEGER | NOT NULL, FK → `users.id` ON DELETE CASCADE | `Session.userId` |
| `created_at` | TEXT | NOT NULL | `Session.createdAt` |
| `last_active_at` | TEXT | NOT NULL | `Session.lastActiveAt` |
| `revoked_at` | TEXT | NULL = 有效 | `Session.revoked` |

**索引**：`INDEX(user_id)`（重設密碼時撤銷該使用者全部 session）。

**有效條件**：`revoked_at IS NULL AND now - last_active_at < SESSION_IDLE_MINUTES`（FR-023）。

## group_settings

| 欄位 | 型別 | 約束 | 對應 |
|------|------|------|------|
| `id` | INTEGER | PK, `CHECK (id = 1)` | |
| `group_count` | INTEGER | NOT NULL DEFAULT 0, `CHECK (group_count BETWEEN 0 AND 50)` | `GroupSettings.groupCount` |
| `updated_at` | TEXT | NOT NULL | |

Migration 初始化時插入 `(1, 0, now)`。

## schema_migrations

| 欄位 | 型別 | 約束 |
|------|------|------|
| `version` | INTEGER | PK |
| `applied_at` | TEXT | NOT NULL |

---

## 狀態轉換

### 學生組別（`users.group_number`）

```text
            學生自選 g（僅當為未分配，條件式更新）
 未分配 ─────────────────────────────────────▶ 第 g 組
 (NULL) ◀───────────────────────────────────── (g)
            老師改回未分配

 第 g 組 ──老師指派 h──▶ 第 h 組
 未分配  ──老師指派 h──▶ 第 h 組
```

- 學生無法從「第 g 組」轉出（FR-034）。
- 調降組數 N → N' 時，若存在 `group_number > N'` 的學生則拒絕（FR-032）。

### 帳號鎖定（`failed_login_count`／`locked_until`）

```text
 正常 ──失敗（視窗內第 1–4 次）──▶ 正常（計數 +1）
 正常 ──視窗內第 5 次失敗──▶ 鎖定（locked_until = now + 15 分）
 鎖定 ──now ≥ locked_until──▶ 正常（計數歸零）
 任何 ──登入成功──▶ 正常（計數歸零）
 任何 ──距 failed_window_started_at ≥ 15 分後的失敗──▶ 新視窗（計數 = 1）
```

### 密碼

```text
 預設密碼(using_default_password=1) ──學生修改──▶ 自訂密碼(0)
 自訂密碼(0) ──老師重設──▶ 預設密碼(1)，並撤銷該學生全部 session
```

### Session

```text
 有效 ──登出──▶ 已撤銷
 有效 ──閒置 ≥ 逾時──▶ 逾時（視同無效，下次請求回 401）
 有效 ──密碼被重設──▶ 已撤銷
```
