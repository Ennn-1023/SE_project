# Research: 基礎建設、登入權限與組別管理（F0／F1／F2）

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-22

使用者指定技術：後端 TypeScript、前端 React + Vite + Tailwind CSS、測試 Vitest、資料庫 SQLite。
以下逐項記錄其餘未定事項的決策。

---

## R1. 執行環境與專案組織

- **Decision**: Node.js 26 LTS；以 npm workspaces 管理單一 repo 內的 `backend/` 與 `frontend/` 兩個套件，根目錄 `package-lock.json` 鎖定版本。
- **Rationale**: 前後端同語言（TypeScript），共用一套 lint／測試指令；workspaces 讓 `npm test` 一次跑完兩邊測試，符合憲章原則 V（可複製的測試指令）。lock 檔符合「相依套件鎖定版本」要求。
- **Alternatives considered**: pnpm workspaces（需另裝工具，組員環境門檻較高）；前後端分兩個 repo（設計圖與規格需跨 repo 同步，不划算）。

## R2. 後端 HTTP 框架

- **Decision**: Express 5 + TypeScript（以 `tsx` 開發執行、`tsc` 型別檢查）。
- **Rationale**: 組件圖的「路由層／中介層（RequireAuth、RequireRole、Validate、ErrorHandler）」與 Express middleware 模型一一對應；Express 5 原生處理 async handler 拋出的錯誤，可直接交給 ErrorHandler 產生一致錯誤格式。
- **Alternatives considered**: Fastify（效能較好但 hook 模型與組件圖的中介層命名不如 Express 直觀）；NestJS（架構偏重，對學生專題過度）。

## R3. SQLite 存取方式

- **Decision**: 使用 Node.js 內建 `node:sqlite`（`DatabaseSync`），以手寫 SQL 搭配 repository 類別；啟用 `PRAGMA foreign_keys = ON`、`journal_mode = WAL`。
- **Rationale**: 內建模組不需編譯原生套件，Windows 組員不必安裝 C++ 建置工具；同步 API 讓交易（`BEGIN IMMEDIATE … COMMIT`）寫法單純。資料表僅 3 張，不需要 ORM。
- **Alternatives considered**: `better-sqlite3`（成熟，但需原生編譯，新版 Node 可能缺預編譯檔，作為備案）；Prisma／Drizzle ORM（增加學習與產生步驟，對 3 張表過度）。
- **Fallback**: 若 `node:sqlite` 在組員環境出現問題，repository 介面不變，僅替換 `backend/src/lib/db.ts` 改用 `better-sqlite3`（兩者 API 相近）。

## R4. 併發安全（學生選組 vs. 老師指派、調降組數）

- **Decision**:
  - 學生自選：單一條件式更新 `UPDATE users SET group_number = ? WHERE id = ? AND role = 'STUDENT' AND group_number IS NULL`，以「影響筆數 = 0」判定已分組（對應時序圖 001-sequence-group 步驟 21–23）。
  - 調降組數：在 `BEGIN IMMEDIATE` 交易內先查詢 `group_number > N` 的學生，有則回 409，無則更新設定。
  - 建立學生：依賴 `users.account` 的 UNIQUE 約束，捕捉衝突回 409（對應 001-sequence-create-student 步驟 14–17）。
- **Rationale**: SQLite 單一寫入者 + 條件式更新／唯一約束即可保證 FR-035、FR-037、FR-011，不需應用層鎖。
- **Alternatives considered**: 應用層 mutex（多行程部署時失效）；先查後寫（有競態）。

## R5. 登入狀態（Session）設計

- **Decision**: 伺服器端 session。登入成功產生 32 bytes 隨機 token，放入 `HttpOnly; SameSite=Lax; Path=/` cookie（正式環境加 `Secure`）；資料庫只存 `HMAC-SHA256(SESSION_SECRET, token)`。每次請求驗證 `revoked_at IS NULL` 且 `now - last_active_at < 閒置逾時`，通過後更新 `last_active_at`。
- **Rationale**: FR-022（登出立即失效）、FR-023（閒置逾時）、FR-025（重設密碼使所有裝置登出）都需要伺服器端可撤銷的 session；JWT 無法即時撤銷。只存 HMAC 值，資料庫外洩也無法直接冒用 session。
- **Alternatives considered**: JWT（無法撤銷）；express-session 套件（需另配 SQLite store，自寫 3 個方法更透明，且對應類別圖 SessionService）。
- **CSRF**: 前後端同源（Vite 開發代理／正式環境同一網域）+ `SameSite=Lax` + 所有變更操作使用 JSON body（`Content-Type: application/json` 檢查），足以防止跨站表單送出。

## R6. 密碼雜湊

- **Decision**: Node 內建 `crypto.scrypt`（非同步版本），參數 `N = 16384, r = 8, p = 1`、16 bytes 隨機 salt、64 bytes 輸出；儲存格式 `scrypt$N$r$p$<salt base64>$<hash base64>`，驗證時以 `crypto.timingSafeEqual` 比對。
- **Rationale**: 非同步 scrypt 在 libuv 執行緒池（預設 4 條）平行計算，不阻塞主執行緒；單次約 30–60 ms，60 人同時登入約在 1 秒內全部完成，符合 SC-007 的 3 秒上限。內建模組免原生編譯、免額外套件。參數寫入雜湊字串，日後調整不影響舊密碼驗證。
- **Alternatives considered**: `bcryptjs`（純 JavaScript 在主執行緒同步計算，60 人同時登入會排隊，最後一人約需 3–6 秒，可能違反 SC-007）；`argon2`、`bcrypt`（需原生編譯，Windows 組員需安裝建置工具）。
- **帳號列舉防護**: 帳號不存在時仍對一組固定的假雜湊執行 `verify`，讓回應時間與密碼錯誤相近（FR-018）。

## R7. 登入失敗鎖定

- **Decision**: 於 `users` 表記錄 `failed_login_count`、`failed_window_started_at`、`locked_until`。15 分鐘視窗內累積 5 次失敗即設定 `locked_until = now + 15 分鐘`；成功登入或視窗過期時歸零。帳號不存在時不記錄（無資料列可記）。
- **Rationale**: 直接實現 FR-019，且不需額外的 rate-limit 服務。
- **Alternatives considered**: 依 IP 的 rate limit（教室 NAT 下全班共用 IP，會誤鎖全班）。

## R8. 輸入驗證

- **Decision**: `zod` schema 定義每個請求的 body／params，由 `Validate` 中介層統一執行；錯誤轉為 `AppError(400, code: VALIDATION_ERROR, field, message, hint)`。前端表單沿用相同規則做即時提示（共用常數，不共用程式碼套件）。
- **Rationale**: 符合憲章原則 I（在系統邊界驗證）與原則 II（指出欄位與修正方式）。
- **Alternatives considered**: 手寫驗證（易遺漏）；class-validator（需 decorator 設定）。

## R9. 一致錯誤格式

- **Decision**: 所有錯誤回應為 `{ "error": { "code", "message", "field"?, "hint"?, "details"? } }`，HTTP 狀態碼：400 輸入錯誤、401 未登入／帳密錯誤、403 角色不符、404 學生不存在、409 狀態衝突、423 帳號鎖定、500 未預期錯誤（訊息固定為「系統發生錯誤，請稍後再試」，細節只寫入已遮罩的 log）。
- **Rationale**: FR-002、憲章原則 II；前端 `ErrorMessage` 元件只需處理一種結構。
- **Note**: 時序圖 001-sequence-login 原標示鎖定為 429；本計畫改用語意更精確的 **423 Locked**，已同步更新該圖（憲章原則 VI：偏離圖表須先更新圖表）。

## R10. 設定與環境變數

- **Decision**: `backend/src/config/env.ts` 以 zod 解析 `process.env`（開發時由 `dotenv` 讀取根目錄 `.env`），啟動時一次驗證，缺漏或格式錯誤則列出變數名稱後 `process.exit(1)`，不印出值。

| 變數 | 必填 | 規則 | 預設 |
|------|------|------|------|
| `STUDENT_DEFAULT_PASSWORD` | 是 | 4–64 字元 | — |
| `TEACHER_INITIAL_PASSWORD` | 是 | 8–64 字元 | — |
| `SESSION_SECRET` | 是 | ≥ 32 字元 | — |
| `TEACHER_ACCOUNT` | 否 | 4–20 英數字 | `teacher` |
| `DATABASE_PATH` | 否 | 檔案路徑 | `./data/app.db`（相對 backend/） |
| `PORT` | 否 | 1–65535 | `3000` |
| `SESSION_IDLE_MINUTES` | 否 | 5–1440 | `120` |
| `NODE_ENV` | 否 | development／test／production | `development` |

- **Rationale**: FR-001、憲章原則 III；預設值皆為非機敏設定。

## R11. Log 與機敏資料遮罩

- **Decision**: 自寫小型 `Logger`（JSON 行輸出），寫入前遞迴遮罩鍵名符合 `/password|secret|token|hash|cookie|authorization/i` 的欄位；測試環境預設靜音。
- **Rationale**: 憲章原則 III 與安全章節；對應組件圖 `Logger（遮罩機敏欄位）`。SC-008 以測試掃描 log 輸出驗證。
- **Alternatives considered**: pino + redact（功能較多但需設定路徑清單，小專案自寫更透明）。

## R12. 前端架構

- **Decision**: React 19 + Vite + TypeScript；`react-router` 處理頁面；Tailwind CSS v4（`@tailwindcss/vite` 外掛），設計 token 以 CSS `@theme` 定義於 `frontend/src/styles/theme.css`；API 呼叫集中於 `ApiClient`（`fetch` + `credentials: 'same-origin'`），開發時 Vite 代理 `/api` 至後端以維持同源。
- **Rationale**: 對應組件圖前端各元件；Tailwind token 讓 FR-003「統一風格」可由單一檔案控管。
- **Design tokens**:

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-cream-50` | `#FAF7F0` | 頁面背景 |
| `--color-cream-100` | `#F5F0E6` | 卡片背景 |
| `--color-cream-300` | `#E6DCC8` | 邊框 |
| `--color-ink` | `#2B2A28` | 主要文字（對米白對比 ≥ 12:1） |
| `--color-accent` | `#1F3A93` | 主要按鈕（深藍撞色，白字對比 ≥ 9:1） |
| `--color-accent-2` | `#FF6B4A` | 次要／強調按鈕（珊瑚橘，深色字） |
| `--color-danger` | `#B42318` | 錯誤訊息 |

- **RWD**: mobile-first，斷點採 Tailwind 預設 `sm 640px`、`lg 1024px`；按鈕最小 `min-h-11 min-w-11`（44 px）。
- **Alternatives considered**: Next.js（需要 SSR 才划算，本專案不需要）；CSS Modules（無法集中 token）。

## R13. 測試策略

- **Decision**: Vitest 為唯一測試執行器。
  - 後端：`supertest` 對 Express app 做 API 整合測試，每個測試檔使用獨立的記憶體資料庫（`:memory:`）與注入式時鐘（測試鎖定、逾時不需真的等待）。
  - 前端：`@testing-library/react` + `jsdom`，以 mock `ApiClient` 測試頁面行為；RWD 以檢查 class 與斷點設定為主，實機寬度檢查列於 quickstart 手動驗證。
  - 每個 FR 至少一個正常案例與一個邊界案例（憲章原則 IV），測試資料皆為虛構學號。
- **Rationale**: 單一測試工具；記憶體 DB + 假時鐘讓測試快速且可重現。
- **Alternatives considered**: Playwright E2E（價值高但安裝瀏覽器較重，列為後續強化）。

## R14. 「即時反映」的範圍（FR-031）

- **Decision**: F2 不建立推播；學生首頁在載入、選組前與選組失敗時重新取得組數，伺服器端驗證永遠以最新組數為準。真正的即時推播屬 F6。
- **Rationale**: 避免在 F2 提前引入 WebSocket；正確性由伺服器端驗證保證，學生最多看到舊的範圍而被伺服器拒絕並得到最新範圍。

## R15. 設計圖與程式碼一致性驗證（憲章原則 VI）

- **Decision**: 於 `backend/tests/architecture/diagram-consistency.test.ts` 建立自動檢查：解析 `diagrams/001-component.puml` 與 `001-class.puml` 的元素名稱，確認每個組件／類別在 plan 的對照表所列檔案中存在對應匯出；實作完成後另以 quickstart 的手動清單比對時序圖流程。
- **Rationale**: 讓「程式碼與圖表一致」成為可重複執行的測試，而非僅人工檢查。
