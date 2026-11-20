# Research: 登入與身分驗證／權限控管（F1）

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-20

使用者已指定：後端 TypeScript、前端 React + Vite + Tailwind CSS、測試 Vitest。以下決定其餘未指定的技術選擇。

---

## R1. 後端執行環境與 HTTP 框架

- **Decision**: Node.js 22 LTS + TypeScript 5（`strict: true`）+ Express 5。
- **Rationale**: Express 是課程與教學資源最多的 Node 框架，組員上手成本最低；Express 5 原生支援 async handler 的錯誤傳遞，可集中到單一錯誤處理中介層輸出統一錯誤格式（憲章原則 II）。後續 F6 即時同步可在同一個 HTTP server 上掛 Socket.IO／WebSocket。
- **Alternatives considered**: Fastify（效能較好、內建 JSON schema 驗證，但驗證規則要與前端共用時不如 zod 方便）；NestJS（結構完整但對本專案規模過重）。

## R2. 輸入驗證

- **Decision**: 使用 zod 定義所有輸入 schema，放在前後端共用的 `shared/` 套件；後端在每個路由進入點驗證（系統邊界），前端在送出前使用同一份 schema 做即時提示。
- **Rationale**: 憲章原則 I 要求在邊界驗證且規則一致；同一份 schema 可避免前後端規則不一致（例如學號 9 位數字、密碼 8–64 字元）。zod 的錯誤可直接對應到 `field`。
- **Alternatives considered**: express-validator（只能用在後端）；手寫驗證（容易遺漏、難以共用）。

## R3. 資料庫與存取層

- **Decision**: SQLite（透過 Prisma ORM），連線字串由環境變數 `DATABASE_URL` 提供（例如 `file:./dev.db`）；測試使用獨立的暫存 SQLite 檔，每個測試檔重建 schema。
- **Rationale**: 課堂規模（約 50 人）SQLite 綽綽有餘；免安裝資料庫伺服器，組員在 Windows／macOS 都能直接執行；Prisma 提供型別安全的查詢與 migration，且日後要換成 PostgreSQL 只需改 provider 與 `DATABASE_URL`。唯一性（帳號名稱）由資料庫 UNIQUE 約束保證，可正確處理「老師連按兩次新增」的競態。
- **Alternatives considered**: PostgreSQL（較適合正式部署，但每位組員都要裝 DB 或 Docker）；記憶體儲存（重啟即遺失帳號，不符需求）。

## R4. 密碼雜湊

- **Decision**: 使用 Node.js 內建 `crypto.scrypt`（N=16384, r=8, p=1, 64-byte key, 每個密碼獨立 16-byte 隨機 salt），儲存格式 `scrypt$N$r$p$salt$hash`；比對使用 `crypto.timingSafeEqual`。
- **Rationale**: 內建、無需原生編譯（`bcrypt` 套件在 Windows 常需建置工具），非同步執行於 libuv thread pool 不會卡住事件迴圈，可同時處理全班登入（SC-002）。scrypt 為記憶體困難（memory-hard）演算法，強度不低於 bcrypt。roadmap 中 bcrypt 僅為範例。
- **Alternatives considered**: `bcrypt`（需原生建置）；`bcryptjs`（純 JS，運算在主執行緒，50 人同時登入時會互相排隊）；argon2（需原生建置）。

## R5. 登入狀態（Session）機制

- **Decision**: 伺服器端 session。登入成功時產生 32-byte 隨機 token，以 HttpOnly、`SameSite=Strict`、（正式環境）`Secure` cookie 傳給瀏覽器；資料庫只存 token 的 SHA-256 雜湊。cookie 以 `SESSION_SECRET` 簽章，竄改即視為未登入。每次請求檢查 session 是否失效、閒置是否超過 2 小時、是否超過登入後 12 小時。
- **Rationale**: 規格要求登出、改密碼、重設密碼、刪除帳號後**立即**讓 session 失效（FR-015、FR-019、FR-020、FR-006a）；伺服器端 session 只要刪除／標記資料列即可，JWT 則需額外黑名單。HttpOnly 防止前端腳本讀取 token；`SameSite=Strict` 加上只接受 `application/json` 請求可防範 CSRF。資料庫只存雜湊，即使資料庫外洩也無法直接冒用 session。
- **Alternatives considered**: JWT（無法立即撤銷）；express-session 套件（可行，但自寫的 session 表更容易對應「依帳號刪除所有 session」與測試）。
- **閒置更新**：`lastSeenAt` 最多每 60 秒寫回一次，避免每個請求都寫資料庫。

## R6. 不洩漏帳號是否存在（FR-009）

- **Decision**: 帳號不存在時，仍對一組啟動時產生的假雜湊執行一次 scrypt 比對，讓兩種失敗情況的耗時相同；兩者回傳相同狀態碼（401）、相同 `code`（`INVALID_CREDENTIALS`）與相同訊息。
- **Rationale**: 只統一訊息不夠，回應時間差異也會洩漏帳號是否存在。
- **Alternatives considered**: 隨機延遲（不可靠、拖慢正常登入）。

## R7. 不限制登入失敗次數（FR-010）

- **Decision**: 依 clarify 結果，不實作帳號鎖定或速率限制；所有登入失敗寫入安全事件紀錄（FR-024）。
- **Rationale**: 使用者已明確接受密碼猜測風險，以避免同學惡意鎖帳號。此為規格決定，非憲章違反（憲章未要求速率限制）。

## R8. 必要環境變數與啟動檢查（FR-022、憲章原則 III）

- **Decision**: 後端啟動時以 zod 驗證 `process.env`；缺少或不合法時列出**變數名稱與原因**（不印出值）並以非 0 結束碼停止。

| 變數 | 必填 | 規則 |
|------|------|------|
| `DATABASE_URL` | 是 | 非空字串 |
| `SESSION_SECRET` | 是 | 至少 32 字元 |
| `STUDENT_DEFAULT_PASSWORD` | 是 | 8–64 字元（與新密碼規則一致） |
| `TEACHER_INITIAL_PASSWORD` | 是 | 8–64 字元 |
| `TEACHER_USERNAME` | 否 | 預設 `teacher`；1–20 字元、不含空白、不可為 9 位數字 |
| `PORT` | 否 | 預設 `3000` |
| `NODE_ENV` | 否 | `development`／`test`／`production`；`production` 時 cookie 加 `Secure` |

- **老師帳號初始化**：伺服器啟動時（以及 `npm run seed`）若不存在任何老師帳號才建立，使用 `TEACHER_USERNAME` 與 `TEACHER_INITIAL_PASSWORD`；已存在則不動（FR-001）。

## R9. 預設密碼與「是否仍為預設密碼」

- **Decision**: 新增／重設學生時，以 `STUDENT_DEFAULT_PASSWORD` 計算新的 scrypt 雜湊（每次新 salt），並設 `usesDefaultPassword = true`；學生自行改密碼後設為 `false`。新密碼不得等於目前的 `STUDENT_DEFAULT_PASSWORD`。
- **Rationale**: 不以「比對雜湊」判斷是否為預設密碼（每次 salt 不同無法比對），以旗標記錄最簡單可靠。
- **已知限制**：若部署後修改 `STUDENT_DEFAULT_PASSWORD`，已建立的帳號仍使用舊預設密碼，直到老師重設。寫入 quickstart 提醒。

## R10. Log 與安全事件

- **Decision**: 應用程式 log 使用 pino，設定 `redact` 遮罩 `password`、`currentPassword`、`newPassword`、`confirmPassword`、`cookie`、`authorization` 等欄位；安全事件（登入成功／失敗、登出、改密碼、重設、新增、刪除）寫入資料庫 `SecurityEvent` 表。
- **Rationale**: 憲章要求 log 不得含機敏資料；安全事件需可查核（FR-024）。登入失敗時記錄「嘗試的帳號名稱」以便事後查核，但不記錄密碼。

## R11. 前端技術細節

- **Decision**: React 19 + Vite + TypeScript + Tailwind CSS v4（以 `@theme` 定義米白色系／撞色 design tokens）+ React Router（路由守衛依 `/api/auth/me` 回傳的角色導向）。開發時透過 Vite proxy 將 `/api` 轉到後端，使前後端同源，cookie 可用 `SameSite=Strict`。
- **Rationale**: 符合使用者指定；同源免 CORS 設定。路由守衛只是 UX，真正的權限檢查在後端（FR-012）。
- **Alternatives considered**: 狀態管理套件（Redux 等）— 本功能只需「目前使用者」一個狀態，用 React Context 即可。

## R12. 測試策略（憲章原則 IV、V）

- **Decision**: 全部使用 Vitest。
  - 後端：單元測試（驗證 schema、密碼雜湊、session 逾時計算、環境變數檢查）＋ API 整合測試（supertest 打 Express app，搭配暫存 SQLite）。
  - 前端：Vitest + jsdom + React Testing Library 測登入表單驗證訊息、角色導向、確認對話框。
  - 時間相關（閒置 2 小時／最長 12 小時）以 `vi.useFakeTimers()` 或可注入的時鐘測試，不真的等待。
  - 測試使用 `.env.test` 中的假值（不進版控）或在測試設定中直接注入假值；不使用真實預設密碼。
- **指令**：根目錄 `npm test` 透過 npm workspaces 執行前後端所有測試（詳見 [quickstart.md](quickstart.md)）。

## R13. 與 F0（基礎建設）的關係

- **Decision**: F0 尚未實作；本功能先建立 F1 所需的最小骨架：npm workspaces（`backend`、`frontend`、`shared`）、環境變數檢查、統一錯誤格式、Tailwind design tokens、Vitest 設定。後續 F0 擴充時沿用這些結構。
- **Rationale**: F1 無法在沒有骨架的情況下實作或測試；只建最小必要部分，避免越界。
