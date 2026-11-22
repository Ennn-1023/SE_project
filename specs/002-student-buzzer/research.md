# Phase 0 Research: 學生端搶答系統（002-student-buzzer）

技術選型由使用者於 2026-11-20 指定：後端 Express + TypeScript + Socket.IO、資料庫 SQLite、前端 React + Vite。
本文件記錄在此前提下的各項設計決策。

---

## R1. 執行環境與語言版本

- **Decision**: Node.js 22 LTS、TypeScript 5.x（`strict: true`），npm workspaces 管理 `backend/`、`frontend/`、`shared/` 三個套件，以 `package-lock.json` 鎖定版本。
- **Rationale**: Node 22 是目前的 LTS，better-sqlite3 與 Socket.IO 都有預編譯版本；workspaces 讓前後端共用 `shared/` 中的型別與常數（如答案長度上限 500），避免兩邊定義不一致。符合憲章「相依套件鎖定版本」。
- **Alternatives considered**: 前後端分成兩個獨立 repo（共用型別不便）；pnpm workspaces（多一個工具要安裝，效益不大）。
- **注意**: 開發機目前未安裝 Node.js，需先安裝 Node 22 LTS（見 quickstart）。

## R2. 即時通訊：Socket.IO 只負責「推播」，送出走 HTTP

- **Decision**:
  - 伺服器 → 學生的狀態推播使用 Socket.IO（事件 `state:update`）。
  - 學生送出答案使用 `POST /api/student/submissions`；取回目前狀態使用 `GET /api/student/state`。
- **Rationale**: 送出需要明確的成功／失敗結果與 HTTP 狀態碼（憲章原則 II：一致錯誤格式、400／409 等），用 REST 最容易以 supertest 驗證。推播則需要伺服器主動通知，Socket.IO 內建自動重連與 room 機制。
- **Alternatives considered**: 全部用 Socket.IO 事件 + ack（錯誤格式較難統一、測試較麻煩）；SSE（使用者已指定 Socket.IO）。

## R3. 依組別過濾推播（FR-015、FR-016）

- **Decision**: 每個學生連線加入 room `team:{teamId}`（未分組者加入 `student:{studentId}`）。階段變化時，伺服器對**每個組別 room 各自**呼叫 `VisibilityFilter.buildView(activity, teamId)` 產生該組視角後才送出；**絕不使用全域廣播傳送含送出資料的 payload**。重連時 `GET /api/student/state` 也走同一個 `buildView`。
- **Rationale**: 過濾在後端單一函式完成，可以直接用單元測試證明「作答中的 view 不含他組資料」（SC-004），推播與重連共用同一邏輯，不會一邊漏掉。
- **Alternatives considered**: 全域廣播再由前端隱藏（違反 FR-015）；每個 socket 各自 build（結果與以組為單位相同，但多做 N 次）。

## R4. 搶答順位與並行送出（FR-007、FR-009、SC-003）

- **Decision**: 作答中的送出保存在記憶體 `Map<teamId, Submission>`。`SubmissionService.submit()` 為**同步函式**：驗證 → 檢查階段 → 檢查本組是否已送出 → 指派 `rank = map.size + 1` 與 `receivedAt = Date.now()` → 寫入 map，中間沒有 `await`。
- **Rationale**: Node.js 單執行緒事件迴圈保證同步區塊不會被其他請求插入，因此「檢查 + 寫入」天然是原子的，不需要鎖；順位就是伺服器處理的先後。
- **Alternatives considered**: 每筆送出立即寫入 SQLite 並以 UNIQUE(question_run_id, team_id) 擋重複（會讓作答中的資料進入資料庫，與 FR-020a「重啟後作答中的資料不保留」相衝突，還得在啟動時另外清除）。

## R5. 持久化策略與伺服器重啟（FR-020、FR-020a）

- **Decision**:
  - 使用 better-sqlite3（同步 API），資料庫路徑由 `SQLITE_PATH` 設定，測試使用 `:memory:`。
  - **作答中**的送出只在記憶體中；題目進入「已結束」時，以**單一交易**一次寫入該題所有 `submissions` 與一筆 `question_results`。
  - `activities` 表保存目前階段與目前題目；每次轉換都會寫入。
  - 啟動時若讀到 `phase = ANSWERING`（代表作答中重啟），改設為 `WAITING`、清空目前題目，並寫回資料庫。
- **Rationale**: 直接對應釐清結果 Q2——作答中重啟時資料自然消失、已結束題目一定已經落盤。單一交易保證不會只寫一半。
- **Alternatives considered**: Prisma／TypeORM（對這個規模太重，還要另外處理 migration 工具）；Node 內建 `node:sqlite`（仍屬實驗性 API）。

## R6. 計時與倒數（FR-003、SC-002）

- **Decision**:
  - 開放題目時，伺服器設定 `endsAt = now + seconds*1000`，並以 `setTimeout` 在 `endsAt` 觸發 `closeQuestion('TIME_UP')`。
  - `closeQuestion` 具冪等性：若階段已經不是 ANSWERING 就直接返回，因此「時間到」與「手動結束」同時發生時只會結束一次。
  - 每次推播與狀態回應都附上 `serverNow`；前端計算 `offset = serverNow - Date.now()`，剩餘時間為 `endsAt - (Date.now() + offset)`，每 250ms 更新一次畫面。倒數歸零但還沒收到 CLOSED 時，顯示「時間到，等待結果」。
- **Rationale**: 伺服器是唯一判定者；前端只負責顯示，並校正裝置時鐘誤差。
- **Alternatives considered**: 伺服器每秒推播剩餘秒數（流量較大，也無法抵銷網路延遲造成的誤差）。

## R7. 身分與開發用 mock 登入（FR-024）

- **Decision**:
  - 正式登入屬於 F1，不在範圍內。開發環境提供 `POST /api/dev/login { studentId }`，回傳以 `SESSION_SECRET` 簽署的 JWT（jsonwebtoken，HS256，有效 8 小時）。
  - REST 以 `Authorization: Bearer` 帶 token；Socket.IO 以 `handshake.auth.token` 帶 token，middleware 驗證後才允許連線。伺服器從 token 的 `studentId` 查出組別，**不接受前端自報的組別**。
  - `/api/dev/*` 只在 `ENABLE_DEV_TOOLS=true` 時掛載；若 `NODE_ENV=production` 卻設定 `ENABLE_DEV_TOOLS=true`，啟動時報錯並停止。
- **Rationale**: 日後 F1 只要換掉簽發 token 的地方，學生端的驗證流程完全不用改；機敏的 `SESSION_SECRET` 只放環境變數（憲章原則 III）。
- **Alternatives considered**: 用 query string 帶 studentId（容易偽造，也會把身分放進 URL，違反隱私要求）。

## R8. 輸入驗證與錯誤格式（憲章原則 I、II）

- **Decision**:
  - 使用 zod 在每個 HTTP 進入點、Socket handshake 與環境變數載入時驗證。
  - 答案驗證規則放在 `shared/`：`trim()` 後不可為空；長度以 Unicode code point 計算（`[...s].length`），上限 500。前後端共用同一份常數與錯誤訊息。
  - 統一錯誤格式 `{ "error": { "code", "field", "message", "hint" } }`；狀態碼：400 驗證錯誤、401 未驗證、403 未分組、404 找不到、409 狀態衝突（已送出、已結束、未開放、活動已結束）。
  - 回應不含 stack trace；log 不記錄 token 或答案以外的個資。
- **Rationale**: 符合憲章原則 I、II，與 roadmap F0 的錯誤格式建議一致。
- **Alternatives considered**: 用 `str.length` 計算長度（emoji 會被算成 2，與「字數」的直覺不符）。

## R9. 前端架構

- **Decision**:
  - React 18 + Vite + TypeScript；不另外引入狀態管理套件，用 `useStudentState` hook（REST 取回 + socket 訂閱）加上 `useReducer` 管理狀態。
  - 依 `phase` 切換四種畫面元件；所有文字都以 React 預設的跳脫方式顯示，**禁止使用 `dangerouslySetInnerHTML`**（處理答案含 HTML 的邊界情況）。
  - 樣式使用 CSS 變數（`tokens.css`：`--color-bg: #FAF7F0`、`--color-surface: #F5F0E6`、`--color-primary: #1F3A93`、`--color-accent: #FF6B4A`），mobile-first，斷點 640px／1024px，按鈕最小高度 44px。
  - 開發環境另有 `/dev` 頁面：選擇 mock 學生登入，以及模擬老師操作面板。
- **Rationale**: 畫面數量少，不需要 Redux；tokens 直接對應 roadmap F0，日後 F0 完成時可以替換成共用版本。
- **Alternatives considered**: Tailwind（多一套工具，日後與 F0 對接較麻煩）。

## R10. 測試策略（憲章原則 IV、V）

- **Decision**:
  - 前後端都用 **Vitest**。
  - 後端單元測試：驗證規則、狀態機（fake timers）、SubmissionService 順位與重複送出、VisibilityFilter 隔離、啟動時 ANSWERING → WAITING 的恢復。
  - 後端整合測試：在隨機 port 啟動真實伺服器，使用 `:memory:` 資料庫，搭配 supertest 與 socket.io-client 進行多客戶端測試（同步、他組資料隔離、結束後送出被拒、10 組同時送出）。
  - 前端：Vitest + jsdom + React Testing Library，測試四種階段畫面、答案驗證提示、倒數校正（fake timers）、斷線提示。
  - 根目錄 `npm test` 會依序跑完所有 workspace 的測試。
- **Rationale**: 同一套測試工具，指令單純，方便依憲章原則 V 回報測試結果。
- **Alternatives considered**: Jest（ESM／TypeScript 設定較繁瑣）；Playwright E2E（列為後續強化，RWD 的 375px／1440px 驗收先以 quickstart 手動步驟檢查）。

## R11. 環境變數

| 變數 | 機敏 | 必要 | 說明 |
|------|------|------|------|
| `SESSION_SECRET` | 是 | 是 | JWT 簽章金鑰，至少 32 字元 |
| `PORT` | 否 | 否 | 後端 port，預設 3000 |
| `SQLITE_PATH` | 否 | 否 | 預設 `./data/buzzer.db`；測試使用 `:memory:` |
| `CLIENT_ORIGIN` | 否 | 否 | CORS 允許的前端來源，預設 `http://localhost:5173` |
| `ENABLE_DEV_TOOLS` | 否 | 否 | `true` 才掛載 mock 登入與模擬老師操作；正式環境禁止 |
| `NODE_ENV` | 否 | 否 | `development`／`test`／`production` |

缺少 `SESSION_SECRET`，或其長度不足時，啟動會顯示缺少或不合法的變數名稱（不含值）並停止。`.env.template` 需補上這些變數名稱。

---

## 實作時的調整（2026-11-20，/speckit-implement）

| 項目 | 原設計 | 實際採用 | 原因 |
|------|--------|----------|------|
| Node.js | 22 LTS | **26 LTS**（`.nvmrc` = 26；`engines` 為 >=22） | `winget install OpenJS.NodeJS.LTS` 目前安裝的 LTS 版本 |
| SQLite 套件（R5） | better-sqlite3 | **Node 內建 `node:sqlite`（`DatabaseSync`）** | better-sqlite3 13.x 需要以 node-gyp 從原始碼編譯，開發機沒有 Visual Studio C++ 工具；Node 26 的 `node:sqlite` 可直接使用、同步 API 相同，交易改以 `BEGIN IMMEDIATE`／`COMMIT`／`ROLLBACK` 包裝（`backend/src/data/db.ts`） |
| React | 18 | **19** | npm 安裝時的最新穩定版，API 用法相同 |
| TypeScript | 5.x | **6.0** | typescript-eslint 8 只支援到 TypeScript 6.0（不支援 7） |
| ESLint | 未指定 | **9** | eslint-plugin-react 尚未支援 ESLint 10 |
| HTTP／Socket.IO 掛載順序 | 未規定 | **Express 必須先掛上，再建立 Socket.IO** | 瀏覽器預設先用 HTTP long-polling；若 Express 後掛，`/socket.io` 會被 Express 回 404。已加入 polling 傳輸的整合測試防止回歸 |
| 前端狀態合併 | 未規定 | **忽略 `serverNow` 比目前畫面更舊的狀態** | 重連時 REST 補抓與 socket 推播可能交錯抵達，避免舊狀態蓋掉新狀態 |
| ENDED 後的操作 | `open` 回 `INVALID_TRANSITION` | **除 dev `reset` 外一律回 `ACTIVITY_ENDED`** | 訊息更明確 |
