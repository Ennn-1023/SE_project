---

description: "Task list for F0/F1/F2 foundation, auth and group management"
---

# Tasks: 基礎建設、登入權限與組別管理（F0／F1／F2）

**Input**: Design documents from `/specs/001-foundation-auth-groups/`

**Prerequisites**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、[data-model.md](data-model.md)、[contracts/openapi.yaml](contracts/openapi.yaml)、[contracts/ui-routes.md](contracts/ui-routes.md)、[quickstart.md](quickstart.md)、`diagrams/001-*.puml`

**Tests**: 憲章原則 IV 要求每個功能具備正常案例與邊界案例測試，因此每個 user story 都包含測試任務，且須先寫測試、確認失敗後再實作。

**Organization**: 依 user story 分組，每個 story 可獨立實作與測試。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行執行（不同檔案、無未完成相依）
- **[Story]**: 所屬 user story（US1–US6）
- 欄位限制一律引用 `data-model.md` 的 `資料表.欄位`，不在此重複

## Path Conventions

- 後端：`backend/src/`、`backend/tests/`
- 前端：`frontend/src/`、`frontend/tests/`
- 元件與檔案對應以 [plan.md「設計圖對照表」](plan.md) 為準；偏離設計須先改 `diagrams/*.puml` 並重新產生 PNG（憲章原則 VI）

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立 npm workspaces、TypeScript、Vite、Tailwind、Vitest 骨架

**前置**：本機需安裝 Node.js 26 LTS（[quickstart.md](quickstart.md) §1）

- [X] T001 建立根目錄 `package.json`：npm workspaces `backend`、`frontend`；scripts `dev`（同時啟動前後端）、`test`（依序執行兩個 workspace 的 Vitest）、`lint`、`typecheck`；`engines.node >= 24`
- [X] T002 [P] 初始化後端套件 `backend/package.json`（依 research R2、R8：express@5、zod、dotenv；密碼雜湊使用內建 `crypto`，不需套件（R6）；dev：typescript、tsx、vitest、supertest、@types/*），scripts `dev`、`build`、`test`、`db:migrate`、`db:seed`，並建立 `backend/tsconfig.json`（`strict: true`、ESM、`module: NodeNext`）
- [X] T003 [P] 初始化前端套件 `frontend/package.json`（react@19、react-dom、react-router；dev：vite、@vitejs/plugin-react、tailwindcss@4、@tailwindcss/vite、typescript、vitest、jsdom、@testing-library/react、@testing-library/user-event、@testing-library/jest-dom），建立 `frontend/tsconfig.json` 與 `frontend/index.html`
- [X] T004 [P] 建立 `backend/vitest.config.ts`（node 環境、`tests/**/*.test.ts`、測試時 `NODE_ENV=test`）
- [X] T005 [P] 建立 `frontend/vite.config.ts`：React 與 Tailwind 外掛、開發伺服器 `/api` 代理至 `http://localhost:3000`（research R12）、Vitest `jsdom` 環境與 `frontend/tests/setup.ts`（載入 jest-dom）
- [X] T006 [P] 設定 ESLint（typescript-eslint）與 Prettier：根目錄 `eslint.config.js`、`.prettierrc`、`.prettierignore`（排除 `diagrams/*.png`、`dist/`、`plantuml.jar`）
- [X] T007 [P] 更新 `.env.template`：列出 research R10 全部變數名稱與說明（必填 `STUDENT_DEFAULT_PASSWORD`、`TEACHER_INITIAL_PASSWORD`、`SESSION_SECRET`；選填 `TEACHER_ACCOUNT`、`DATABASE_PATH`、`PORT`、`SESSION_IDLE_MINUTES`、`NODE_ENV`），值一律留空或為非機敏預設，不得填入實際密碼
- [X] T008 執行 `npm install` 產生並提交根目錄 `package-lock.json`；確認 `npm test` 在無測試時可正常結束

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有 user story 共用的設定、資料庫、錯誤處理、session 與角色檢查框架、前端風格系統

**⚠️ CRITICAL**: 本階段完成前不可開始任何 user story

### 後端基礎

- [X] T009 [P] 實作 `Config` 於 `backend/src/config/env.ts`：以 zod 解析 `process.env`（research R10 規則與預設），開發時以 dotenv 載入根目錄 `.env`；缺漏或格式錯誤時拋出列出變數名稱（不含值）的錯誤（FR-001）
- [X] T010 [P] 實作 `Clock` 於 `backend/src/lib/clock.ts`：`systemClock` 與測試用 `createFakeClock(start)`（可 `advance(ms)`）
- [X] T011 [P] 實作 `AppError` 與錯誤碼常數於 `backend/src/lib/errors.ts`：欄位 `status`、`code`、`message`、`field?`、`hint?`、`details?`，錯誤碼與狀態碼對應 research R9 與 `contracts/openapi.yaml` 的 `ErrorResponse.error.code`
- [X] T012 [P] 實作 `Logger` 於 `backend/src/lib/logger.ts`：JSON 行輸出、遞迴遮罩 research R11 所列鍵名、`NODE_ENV=test` 預設靜音、可注入輸出目標以便測試
- [X] T013 [P] 實作 `PasswordHasher` 於 `backend/src/lib/password.ts`：以 Node 內建 `crypto.scrypt`（非同步、於 libuv 執行緒池執行）實作 async `hash`／`verify`，參數與儲存格式依 research R6，比對使用 `timingSafeEqual`；匯出固定假雜湊供帳號不存在時比對
- [X] T014 [P] 定義領域型別於 `backend/src/domain/types.ts`（`Role`、`User`、`Teacher`、`Student`、`Session`、`GroupSettings`、`GroupSummary`、`MyGroupView`、`CreateStudentInput`，對應 `diagrams/001-class.puml`）與介面於 `backend/src/domain/ports.ts`（`PasswordHasher`、`UserRepository`、`SessionRepository`、`GroupSettingsRepository`，方法名稱與類別圖一致）
- [X] T015 實作 SQLite 連線於 `backend/src/lib/db.ts`：`node:sqlite` `DatabaseSync`、`PRAGMA foreign_keys = ON`、`journal_mode = WAL`、`transaction(fn)` 工具（`BEGIN IMMEDIATE`）、支援 `:memory:`（research R3）
- [X] T016 實作 migration 於 `backend/src/db/migrations.ts`：依 data-model.md 建立 `schema_migrations.version`、`schema_migrations.applied_at`；`users`（`users.account`、`users.display_name`、`users.role`、`users.password_hash`、`users.using_default_password`、`users.group_number`、`users.failed_login_count`、`users.failed_window_started_at`、`users.locked_until`、`users.created_at`、`users.updated_at` 及其索引）；`sessions`（`sessions.id`、`sessions.user_id`、`sessions.created_at`、`sessions.last_active_at`、`sessions.revoked_at` 及索引）；`group_settings`（`group_settings.id`、`group_settings.group_count`、`group_settings.updated_at`，並插入初始列）。重複執行須為冪等
- [X] T017 [P] 實作 `UserRepository` 於 `backend/src/db/userRepository.ts`：`findByAccount`、`findStudent`、`createStudent`（`users.account` 唯一衝突轉為可辨識的錯誤）、`updateGroupIfUnassigned`（回傳是否更新成功，條件見 research R4）、`updateGroup`、`updatePassword`、`recordLoginFailure`、`resetLoginFailures`、`listStudents`、`findStudentsInGroupsAbove(n)`；欄位依 data-model.md `users.*`
- [X] T018 [P] 實作 `SessionRepository` 於 `backend/src/db/sessionRepository.ts`：方法 `create`、`findById`、`updateLastActive`（data-model.md `sessions.last_active_at`）、`revoke`、`revokeAllForUser`（data-model.md `sessions.revoked_at`），簽章依 `diagrams/001-class.puml`
- [X] T019 [P] 實作 `GroupSettingsRepository` 於 `backend/src/db/groupSettingsRepository.ts`：方法 `get`、`setGroupCount`，讀寫 data-model.md `group_settings.group_count` 與 `group_settings.updated_at`，簽章依 `diagrams/001-class.puml`
- [X] T020 實作 `SessionService` 於 `backend/src/services/sessionService.ts`：`create`（產生 32 bytes token，儲存 HMAC 值為 `sessions.id`，research R5）、`validate`（檢查 `sessions.revoked_at` 與 `SESSION_IDLE_MINUTES` 閒置逾時，失敗拋 `UNAUTHENTICATED`）、`touch`、`revoke`、`revokeAllForUser`；以注入的 `Clock` 計時
- [X] T021 [P] 實作 `Validate` 中介層於 `backend/src/middleware/validate.ts`：接受 zod schema 驗證 body／params，失敗轉為 `AppError(400, VALIDATION_ERROR, field, message, hint)`；非 JSON 的變更請求回 415 `UNSUPPORTED_MEDIA`
- [X] T022 [P] 實作 `ErrorHandler` 於 `backend/src/middleware/errorHandler.ts`：`AppError` 轉為 `{ error: {...} }`；其他錯誤回 500 固定訊息並以 `Logger` 記錄（不含堆疊給使用者）
- [X] T023 實作 `RequireAuth` 於 `backend/src/middleware/requireAuth.ts`（讀取 `sid` cookie → `SessionService.validate` → `touch` → 將目前使用者放入 `req`）與 `RequireRole` 於 `backend/src/middleware/requireRole.ts`（角色不符拋 403 `FORBIDDEN`「此功能僅限老師使用」）
- [X] T024 建立 `backend/src/app.ts`：`createApp(deps)` 注入 config、db、clock、hasher、logger；掛載 `express.json()`、`/api/health`、`/api` 路由器（各 story 註冊路由）、`ErrorHandler`；建立 `backend/src/server.ts`：載入 Config → 開 DB → migrate → listen，Config 錯誤時印出訊息並 `process.exit(1)`
- [X] T025 實作 `AccountService.seedTeacher` 於 `backend/src/services/accountService.ts`（`TEACHER_ACCOUNT` 正規化後寫入 `users.account`、`users.role` = TEACHER、`users.password_hash` 為 `TEACHER_INITIAL_PASSWORD` 雜湊；已存在則略過不覆蓋）與 CLI `backend/src/cli/migrate.ts`、`backend/src/cli/seed.ts`
- [X] T026 [P] 建立後端測試輔助 `backend/tests/helpers/testApp.ts`：以 `:memory:` DB、假時鐘、測試 Config（虛構值）建立 app，提供 `loginAs(agent, account, password)`、`seedStudent(...)`、`setGroupCount(n)` 等工具

### 後端基礎測試

- [X] T027 [P] 單元測試 `backend/tests/unit/config.test.ts`：完整設定成功載入（正常）；缺少 `SESSION_SECRET`、`SESSION_SECRET` 少於 32 字元、`PORT` 非數字時錯誤訊息只含變數名稱不含值（邊界）
- [X] T028 [P] 單元測試 `backend/tests/unit/logger.test.ts`：一般欄位正常輸出；巢狀物件中的 `password`、`newPassword`、`sessionSecret`、`cookie` 被遮罩（SC-008）
- [X] T029 [P] 單元測試 `backend/tests/unit/sessionService.test.ts`：建立後可驗證（正常）；撤銷後、閒置剛好等於與超過 `SESSION_IDLE_MINUTES`、偽造 token 皆回 `UNAUTHENTICATED`（邊界）；確認資料庫中 `sessions.id` 不等於原始 token
- [X] T030 [P] 整合測試 `backend/tests/integration/errorFormat.test.ts`：`GET /api/health` 回 200；未知錯誤回 500 固定訊息且不含堆疊；非 JSON 的 POST 回 415

### 前端基礎

- [X] T031 [P] 建立 UI 風格系統 `frontend/src/styles/theme.css`：Tailwind v4 `@import "tailwindcss"` 與 `@theme` token（research R12 色票）、`body` 米白背景與主要文字色
- [X] T032 [P] 實作 `ApiClient` 於 `frontend/src/api/apiClient.ts`：`fetch` + `credentials: 'same-origin'`、JSON 編解碼、將 `ErrorResponse` 轉為 `ApiError`（含 code／field／message／hint／details）；僅在錯誤碼為 `UNAUTHENTICATED` 時觸發全域「未登入」事件（`INVALID_CREDENTIALS` 等其他 401 不觸發，避免登入失敗被當成登出）
- [X] T033 [P] 實作共用元件 `frontend/src/components/ErrorMessage.tsx`（顯示 message 與 hint，`role="alert"`）、`frontend/src/components/Button.tsx`（`primary` 深藍撞色、`secondary` 珊瑚橘，`min-h-11 min-w-11`）、`frontend/src/components/Layout.tsx`（RWD 容器、頁首）
- [X] T034 實作 `frontend/src/auth/AuthContext.tsx`：載入時呼叫 `GET /api/auth/me`，提供 `user`、`setUser`、`logout`；收到「未登入」事件時清除狀態；並建立 `frontend/src/main.tsx` 路由表骨架（依 contracts/ui-routes.md，各頁先放占位元件）
- [X] T035 [P] 前端測試 `frontend/tests/components.test.tsx`：`ErrorMessage` 顯示 message 與 hint（正常）、沒有 hint 時不顯示空白區塊（邊界）；`Button` 具最小尺寸 class 與兩種變體；`ApiClient` 收到 401 `UNAUTHENTICATED` 時觸發「未登入」事件、收到 401 `INVALID_CREDENTIALS` 與 400 `INVALID_CURRENT_PASSWORD` 時不觸發

**Checkpoint**: `npm test` 全數通過；`npm run dev` 可啟動並看到占位頁面

---

## Phase 3: User Story 1 - 學生以學號與預設密碼登入 (Priority: P1) 🎯 MVP

**Goal**: 老師建立學生帳號（學號＋姓名），學生以學號＋預設密碼登入並依角色進入首頁

**Independent Test**: 老師登入 → 建立一位學生 → 該生以預設密碼登入進入 `/student`（quickstart §6 步驟 1–4、6）

### Tests for User Story 1 ⚠️

> 先寫測試並確認失敗，再實作

- [X] T036 [P] [US1] 整合測試 `backend/tests/integration/auth.test.ts`（登入）：老師與學生正確登入回 200、設定 `sid` cookie、回傳正確 `role`（正常）；帳號前後空白與小寫可登入；錯誤密碼與不存在帳號回相同 401 訊息「帳號或密碼錯誤」；空白欄位回 400 指出欄位；15 分鐘內第 5 次失敗回 423 並含 `retryAfterSeconds`；鎖定期滿可再登入；視窗過期後失敗重新計數（以假時鐘驗證 data-model.md `users.failed_login_count`、`users.failed_window_started_at`、`users.locked_until` 的狀態轉換）
- [X] T037 [P] [US1] 整合測試 `backend/tests/integration/students.test.ts`（建立與清單）：建立學生回 201，`groupNumber` 為 null、`usingDefaultPassword` 為 true（正常）；`b1103` 與既有 `B1103` 衝突回 409 且原帳號不變；學號含空白、符號、3 字元、21 字元與姓名空白、51 字元回 400 並指出欄位（邊界，依 data-model.md `users.account`、`users.display_name`）；`GET /api/students` 依學號排序且不含密碼欄位
- [X] T038 [P] [US1] 前端測試 `frontend/tests/LoginPage.test.tsx`：成功登入後老師導向 `/teacher`、學生導向 `/student`；空欄位顯示欄位錯誤；401／423 顯示伺服器訊息
- [X] T039 [P] [US1] 前端測試 `frontend/tests/StudentCreatePanel.test.tsx`：建立成功顯示「已建立 學號 姓名」並刷新清單；409 與 400 顯示 `ErrorMessage`

### Implementation for User Story 1

- [X] T040 [P] [US1] 建立 zod schema `backend/src/schemas/auth.ts`（login body）與 `backend/src/schemas/students.ts`（create body：依 data-model.md `users.account` 的學號規則並於驗證後轉大寫、`users.display_name` 去除前後空白）
- [X] T041 [US1] 實作 `AuthService.login` 於 `backend/src/services/authService.ts`：依 `diagrams/001-sequence-login.puml` 步驟 8–23；帳號正規化、鎖定判斷（423）、不存在帳號仍以假雜湊比對、失敗記錄與 5 次鎖定 15 分鐘、成功時重置失敗計數並 `SessionService.create`（更新 data-model.md `users.failed_login_count`、`users.failed_window_started_at`、`users.locked_until`）
- [X] T042 [US1] 實作 `AuthRoutes` 於 `backend/src/routes/authRoutes.ts`：`POST /api/auth/login`（設定 `sid` cookie：HttpOnly、SameSite=Lax、Path=/、production 加 Secure）、`GET /api/auth/me`（經 `RequireAuth`），回應格式依 `contracts/openapi.yaml`
- [X] T043 [US1] 實作 `AccountService.createStudent` 與 `listStudents` 於 `backend/src/services/accountService.ts`：依 `diagrams/001-sequence-create-student.puml`；以 `STUDENT_DEFAULT_PASSWORD` 雜湊寫入 `users.password_hash`，`users.using_default_password` = 1、`users.group_number` = NULL；唯一衝突轉 409 `STUDENT_EXISTS`
- [X] T044 [US1] 實作 `StudentRoutes` 於 `backend/src/routes/studentRoutes.ts`：`GET /api/students`、`POST /api/students`，皆經 `RequireAuth` + `RequireRole(TEACHER)` + `Validate`；於 `backend/src/app.ts` 註冊 auth 與 students 路由
- [X] T045 [P] [US1] 實作 `LoginPage` 於 `frontend/src/pages/LoginPage.tsx`：學號／帳號與密碼欄位、即時必填提示、送出後依角色導向、顯示 `ErrorMessage`；已登入者造訪 `/login` 時自動導向
- [X] T046 [P] [US1] 實作 `StudentCreatePanel` 於 `frontend/src/pages/StudentCreatePanel.tsx`：學號、姓名表單與學生清單表格（學號、姓名、組別、是否預設密碼），建立中停用按鈕避免重複送出
- [X] T047 [US1] 實作 `TeacherDashboard` 於 `frontend/src/pages/TeacherDashboard.tsx`（內含 `StudentCreatePanel`）與最小版 `StudentHome` 於 `frontend/src/pages/StudentHome.tsx`（顯示姓名與學號），並在 `frontend/src/main.tsx` 接上 `/login`、`/teacher`、`/student`、`/` 導向

**Checkpoint**: US1 測試全部通過；可依 quickstart §6 步驟 1–4、6 手動完成建立帳號與登入

---

## Phase 4: User Story 2 - 老師登入並只有老師能使用管理功能 (Priority: P1)

**Goal**: 角色權限、登出、閒置逾時全面生效，前後端皆擋下越權存取

**Independent Test**: 以老師與學生分別登入，學生開啟 `/teacher` 或呼叫老師 API 皆被拒絕；登出與逾時後需重新登入（quickstart §6 步驟 9、15）

### Tests for User Story 2 ⚠️

- [X] T048 [P] [US2] 整合測試 `backend/tests/integration/authorization.test.ts`：表格驅動逐一呼叫所有老師端點（`GET/POST /api/students`、`POST /api/students/{id}/reset-password`、`PUT /api/groups/settings`、`GET /api/groups/overview`、`PUT /api/groups/assignments/{id}`）：未登入回 401、學生回 403「此功能僅限老師使用」、老師不回 401／403（SC-004）；學生端點（`GET/POST /api/groups/me`）老師呼叫回 403。尚未實作的端點以 `it.todo` 標示，於各 story 完成時改為實際測試
- [X] T049 [P] [US2] 整合測試 `backend/tests/integration/logout.test.ts`：登出回 204 且同一 cookie 再呼叫 `/api/auth/me` 回 401（正常）；未登入登出回 401；閒置 2 小時減 1 秒仍有效、達 2 小時回 401（假時鐘，邊界）；同一學生兩裝置登入，其中一台登出不影響另一台
- [X] T050 [P] [US2] 前端測試 `frontend/tests/routeGuards.test.tsx`：未登入造訪 `/teacher`、`/student`、`/account/password` 導向 `/login`；學生造訪 `/teacher` 顯示「此功能僅限老師使用」；API 回 401 `UNAUTHENTICATED` 時導向 `/login`

### Implementation for User Story 2

- [X] T051 [US2] 實作 `AuthService.logout` 於 `backend/src/services/authService.ts` 與 `POST /api/auth/logout` 於 `backend/src/routes/authRoutes.ts`（撤銷 session：設定 data-model.md `sessions.revoked_at`，並清除 `sid` cookie）
- [X] T052 [US2] 於 `frontend/src/main.tsx` 實作路由守衛元件（依 contracts/ui-routes.md 的允許角色、未登入、角色不符處理）與 404 頁
- [X] T053 [US2] 於 `frontend/src/components/Layout.tsx` 加入登出按鈕（呼叫 `AuthContext.logout` 後導向 `/login`）與目前使用者名稱顯示

**Checkpoint**: US1、US2 測試全部通過；越權與登出行為符合 quickstart §6 步驟 9、15。**注意**：T048 中 US3–US5 端點仍為 `it.todo`，SC-004（100% 老師功能拒絕學生）須待 US5 完成、所有 `it.todo` 轉為實際測試後才算達成

---

## Phase 5: User Story 3 - 學生在未分組時自選組別 (Priority: P2)

**Goal**: 未分配學生可從 1..N 選組，已分組者不可自行更換

**Independent Test**: 以測試輔助將組數設為 5，未分組學生選第 3 組成功，再選第 4 組被拒（quickstart §6 步驟 6–8）

### Tests for User Story 3 ⚠️

- [X] T054 [P] [US3] 整合測試 `backend/tests/integration/groups.selfSelect.test.ts`：`GET /api/groups/me` 回 `groupNumber` 與 `groupCount`；未分配學生選 3 成功（正常）；已分組再選回 409 `ALREADY_ASSIGNED` 並附 `currentGroupNumber`；選 0、6、`"3"`、3.5、缺欄位回 400 並附最新 `groupCount`；組數為 0 時回 409 `GROUPS_NOT_OPEN`；先以 repository 指派到第 2 組再呼叫自選，回 409 且組別仍為 2（模擬 FR-035 併發，依 data-model.md `users.group_number`）
- [X] T055 [P] [US3] 前端測試 `frontend/tests/StudentHome.test.tsx`：`groupCount = 0` 顯示「老師尚未開放分組」；未分配顯示 1..N 按鈕，點擊後顯示「你在第 g 組」且按鈕消失；收到 409 時顯示訊息並更新為伺服器回傳的組別

### Implementation for User Story 3

- [X] T056 [P] [US3] 建立 zod schema `backend/src/schemas/groups.ts`：自選 body（`groupNumber` 為正整數，範圍上限於服務層依 data-model.md `group_settings.group_count` 檢查）
- [X] T057 [US3] 實作 `GroupService.getSettings`、`getMyGroup`（回傳 `MyGroupView`）與 `selfSelect` 於 `backend/src/services/groupService.ts`：依 `diagrams/001-sequence-group.puml`「學生自選組別」段（N = 0 回 409 `GROUPS_NOT_OPEN`、範圍外回 400 並附 `groupCount`）；以 `UserRepository.updateGroupIfUnassigned` 條件式更新 data-model.md `users.group_number`
- [X] T058 [US3] 實作 `GroupRoutes` 於 `backend/src/routes/groupRoutes.ts`：`GET /api/groups/settings`（任何已登入者）、`GET /api/groups/me`、`POST /api/groups/me`（`RequireRole(STUDENT)`），並於 `backend/src/app.ts` 註冊；將 T048 中對應的 `it.todo` 改為實際測試
- [X] T059 [US3] 擴充 `StudentHome` 於 `frontend/src/pages/StudentHome.tsx`：依 contracts/ui-routes.md「學生首頁狀態」三種狀態呈現，選組按鈕為 RWD 格狀排列（手機 3 欄、桌機 6 欄）

**Checkpoint**: US3 測試通過；學生端分組流程可獨立展示

---

## Phase 6: User Story 4 - 老師管理組別 (Priority: P2)

**Goal**: 老師設定組數、檢視組別總覽、指派或改回未分配

**Independent Test**: 老師設定 4 組，將學生從第 1 組移到第 2 組、另一位改回未分配，總覽正確；有成員時調降組數被拒（quickstart §6 步驟 5、10、11）

### Tests for User Story 4 ⚠️

- [X] T060 [P] [US4] 整合測試 `backend/tests/integration/groups.manage.test.ts`：`PUT /api/groups/settings` 設為 4 成功、學生端 `GET /api/groups/me` 立即回 4（正常）；設為 -1、51、2.5、`"4"` 回 400（依 data-model.md `group_settings.group_count`）；第 4 組有成員時調為 3 回 409 `GROUP_NOT_EMPTY` 並列出 `blockingGroups`；全部未分組時可設為 0；`PUT /api/groups/assignments/{id}` 指派到 2、改回 null 成功；指派到 5（> N）回 400；不存在學號回 404；`GET /api/groups/overview` 含 0 人的組與未分組清單
- [X] T061 [P] [US4] 前端測試 `frontend/tests/GroupManagePanel.test.tsx`：設定組數後總覽重新整理；409 顯示阻擋的組別與成員；變更學生組別（含「未分配」選項）後總覽更新

### Implementation for User Story 4

- [X] T062 [US4] 擴充 `backend/src/schemas/groups.ts`：組數 body（整數，依 data-model.md `group_settings.group_count`）、指派 body（正整數或 null，依 data-model.md `users.group_number`）、`studentId` path 參數（依 data-model.md `users.account` 規則）
- [X] T063 [US4] 實作 `GroupService.setGroupCount`、`assign`、`overview`、`unassigned` 於 `backend/src/services/groupService.ts`：依 `diagrams/001-sequence-group.puml`「老師設定組數」「老師調整學生組別」段；調降組數於 `db.transaction` 內檢查 `UserRepository.findStudentsInGroupsAbove`（research R4）
- [X] T064 [US4] 於 `backend/src/routes/groupRoutes.ts` 加入 `PUT /api/groups/settings`、`GET /api/groups/overview`、`PUT /api/groups/assignments/:studentId`（`RequireRole(TEACHER)`），並將 T048 中對應的 `it.todo` 改為實際測試
- [X] T065 [US4] 實作 `GroupManagePanel` 於 `frontend/src/pages/GroupManagePanel.tsx`：組數輸入、各組卡片（編號、人數、成員）、未分組清單、每位學生的組別下拉選單（含「未分配」）；手機單欄、桌機多欄；並放入 `TeacherDashboard`

**Checkpoint**: US3、US4 一起運作：老師調整後學生重新整理即看到新組別

---

## Phase 7: User Story 5 - 帳號維護：修改密碼與重設密碼 (Priority: P2)

**Goal**: 學生自行改密碼；老師重設學生密碼為預設並使其所有裝置登出；不強制也不提示改密碼

**Independent Test**: 學生改密碼後新密碼可登入、舊密碼不行；老師重設後學生被登出且預設密碼可登入（quickstart §6 步驟 13、14）

### Tests for User Story 5 ⚠️

- [X] T066 [P] [US5] 整合測試 `backend/tests/integration/password.test.ts`：`POST /api/auth/change-password` 成功回 204、舊密碼登入 401、新密碼登入 200、`usingDefaultPassword` 變 false（正常）；目前密碼錯誤回 400 `INVALID_CURRENT_PASSWORD` 並指出 `currentPassword`，且該 session 仍有效（不得被當成登出）；新密碼 7 字元、65 字元、等於預設密碼、兩次不一致回 400 並指出欄位（邊界）；老師修改自己的密碼回 204、新密碼可登入，之後再執行 `AccountService.seedTeacher` 不會覆蓋（FR-024）；`POST /api/students/{id}/reset-password` 回 204，該生兩個裝置的 session 都失效，預設密碼可登入、`usingDefaultPassword` 為 true；不存在學號回 404；使用預設密碼登入的學生 `GET /api/auth/me` 不含任何改密碼要求（FR-027）
- [X] T067 [P] [US5] 前端測試 `frontend/tests/ChangePasswordForm.test.tsx`：成功顯示完成訊息；不一致時顯示欄位錯誤且不送出；伺服器錯誤顯示 `ErrorMessage`

### Implementation for User Story 5

- [X] T068 [P] [US5] 擴充 `backend/src/schemas/auth.ts`：修改密碼 body（新密碼長度依 data-model.md「驗證規則：新密碼」，「不得等於預設密碼」於服務層檢查）
- [X] T069 [US5] 實作 `AuthService.changePassword` 於 `backend/src/services/authService.ts`：驗證目前密碼、更新 data-model.md `users.password_hash` 與 `users.using_default_password` = 0；路由 `POST /api/auth/change-password` 於 `backend/src/routes/authRoutes.ts`
- [X] T070 [US5] 實作 `AccountService.resetPassword` 於 `backend/src/services/accountService.ts`：寫回預設密碼雜湊、`users.using_default_password` = 1，並 `SessionService.revokeAllForUser`（data-model.md `sessions.revoked_at`）；路由 `POST /api/students/:studentId/reset-password` 於 `backend/src/routes/studentRoutes.ts`，並將 T048 中對應的 `it.todo` 改為實際測試
- [X] T071 [P] [US5] 實作 `ChangePasswordForm` 於 `frontend/src/pages/ChangePasswordForm.tsx`（路由 `/account/password`），並在 `Layout` 加入「修改密碼」連結
- [X] T072 [US5] 於 `frontend/src/pages/StudentCreatePanel.tsx` 的學生清單每列加入「重設密碼」按鈕（確認對話框後呼叫 API，成功後刷新清單）

**Checkpoint**: US1–US5 全部測試通過

---

## Phase 8: User Story 6 - 一致的外觀與跨裝置可用 (Priority: P3)

**Goal**: 全部頁面風格一致、320–1920 px 無水平捲動、觸控區 ≥ 44 px

**Independent Test**: 於 375 px 與 1440 px 完成登入、選組、老師調整組別（quickstart §7）

### Tests for User Story 6 ⚠️

- [X] T073 [P] [US6] 前端測試 `frontend/tests/style.test.tsx`：每個頁面元件的主要按鈕皆使用 `Button`（具 `min-h-11`）；表格／清單容器具橫向溢出保護 class（`overflow-x-auto` 或改為卡片），頁面根元素不設定固定寬度
- [X] T074 [P] [US6] 前端測試 `frontend/tests/theme.test.ts`：讀取 `frontend/src/styles/theme.css`，確認 research R12 全部 token 存在且值正確

### Implementation for User Story 6

- [X] T075 [US6] 逐頁檢視並修正 `frontend/src/pages/*.tsx` 與 `frontend/src/components/Layout.tsx`：mobile-first 間距、`sm`／`lg` 斷點、學生清單在手機改為卡片、長學號／姓名斷行，不得出現硬編碼色碼（一律使用 token）
- [X] T076 [US6] 統一表單錯誤呈現：所有表單欄位錯誤與 API 錯誤皆經 `ErrorMessage`，欄位以 `aria-invalid` 與 `aria-describedby` 連結錯誤（`frontend/src/pages/*.tsx`）

**Checkpoint**: 所有 user story 完成，quickstart §7 手動檢查通過

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 設計一致性驗證、機敏資料檢查、文件與最終驗收

- [X] T077 [P] 實作 `backend/tests/architecture/diagram-consistency.test.ts`（research R15）：解析 `diagrams/001-component.puml` 與 `diagrams/001-class.puml` 的元素名稱，依 plan.md「設計圖對照表」確認對應檔案存在並匯出同名符號、服務公開方法名稱與類別圖一致，repository 介面方法也須與類別圖一致；確認 `backend/src/routes`、`services`、`db`、`middleware` 下的每個檔案都在對照表或 plan.md「基礎設施檔案允許清單」中
- [X] T078 [P] 機敏資料測試 `backend/tests/integration/noSecretsLeak.test.ts`（SC-008）：執行登入、建立學生、改密碼、重設密碼、錯誤情境，擷取所有回應 body 與 Logger 輸出，斷言其中不含測試用預設密碼、老師密碼、session secret、`sid` token 與任何密碼雜湊（`users.password_hash` 的值）
- [X] T079 [P] 併發測試 `backend/tests/integration/concurrency.test.ts`（SC-007）：使用正式的 scrypt 參數（research R6），60 位學生同時登入後同時自選組別，斷言每個請求從送出到收到回應皆 ≤ 3 秒、每人恰屬一組；同時對同一未分配學生送出自選與老師指派（重複多輪），斷言最終 data-model.md `users.group_number` 一律等於老師指派的組別（US3-5、FR-035），學生端回應為 409 `ALREADY_ASSIGNED`，或回 200 後被老師指派覆寫，且無 500 或其他錯誤狀態
- [X] T080 [P] 撰寫根目錄 `README.md`：專案簡介、前置需求、設定與啟動指令（引用 quickstart.md）、測試指令、設計圖重新產生指令
- [X] T081 執行 `java -jar plantuml.jar -charset UTF-8 "./diagrams/*.puml"`，確認所有 PNG 與 `.puml` 同步
- [X] T082 執行 `npm run lint`、`npm run typecheck`、`npm test`，全部通過並記錄通過／失敗數量
- [ ] T083 依 quickstart.md §5–§8 完成手動驗證（含 §6 計時檢查 SC-001～SC-003）；依三張時序圖逐步比對程式流程（憲章原則 VI），將結果與 T082 的測試指令與數量寫入完成回報（憲章原則 V）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：需先安裝 Node.js；無其他相依
- **Foundational (Phase 2)**：依賴 Setup；阻擋所有 user story
- **User Stories (Phase 3–8)**：皆依賴 Foundational
- **Polish (Phase 9)**：依賴所有 user story 完成

### User Story Dependencies

| Story | 依賴 | 說明 |
|-------|------|------|
| US1 (P1) | Foundational | MVP；含老師登入與建立學生 |
| US2 (P1) | US1 | 需要登入端點；T048 為跨端點授權表，其餘端點以 `it.todo` 先佔位 |
| US3 (P2) | Foundational、US1（登入） | 組數以測試輔助直接設定，不依賴 US4 |
| US4 (P2) | Foundational、US1（登入） | 與 US3 共用 `groupRoutes.ts`／`groupService.ts`，建議 US3 → US4 依序 |
| US5 (P2) | US1 | 修改密碼用 `authRoutes.ts`，重設用 `studentRoutes.ts` |
| US6 (P3) | US1、US3、US4、US5 的頁面 | 為全頁面的 RWD 收尾 |

### Within Each User Story

- 測試先寫並確認失敗
- schema → service → route → 前端頁面
- 同一檔案的任務依序執行（例如 `authService.ts`：T041 → T051 → T069）

### Parallel Opportunities

- Phase 1：T002–T007 可平行
- Phase 2：T009–T014 可平行；T017–T019 可平行；T021、T022、T026–T035 中標 [P] 者可平行
- US1：T036–T039 測試可平行；T040、T045、T046 可平行
- US3 與 US5 在 US1 完成後可由不同組員平行進行（檔案不重疊：US3 為 `groupService.ts`／`groupRoutes.ts`／`StudentHome.tsx`；US5 為 `authService.ts` 改密碼段／`ChangePasswordForm.tsx`，但 T070 與 T072 需等 US1 的 `accountService.ts`、`StudentCreatePanel.tsx` 完成）
- Phase 9：T077–T080 可平行

---

## Parallel Example: User Story 1

```bash
# 同時撰寫 US1 的測試：
Task: "整合測試 backend/tests/integration/auth.test.ts（登入）"
Task: "整合測試 backend/tests/integration/students.test.ts（建立與清單）"
Task: "前端測試 frontend/tests/LoginPage.test.tsx"
Task: "前端測試 frontend/tests/StudentCreatePanel.test.tsx"

# 測試完成後同時進行：
Task: "建立 zod schema backend/src/schemas/auth.ts 與 students.ts"
Task: "實作 LoginPage 於 frontend/src/pages/LoginPage.tsx"
Task: "實作 StudentCreatePanel 於 frontend/src/pages/StudentCreatePanel.tsx"
```

## Parallel Example: User Story 3 與 User Story 5（US1 完成後）

```bash
# 組員 A（US3）
Task: "整合測試 backend/tests/integration/groups.selfSelect.test.ts"
Task: "實作 GroupService.getSettings 與 selfSelect 於 backend/src/services/groupService.ts"

# 組員 B（US5）
Task: "整合測試 backend/tests/integration/password.test.ts"
Task: "實作 ChangePasswordForm 於 frontend/src/pages/ChangePasswordForm.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1 Setup
2. 完成 Phase 2 Foundational
3. 完成 Phase 3 US1：老師建立學生、學生登入
4. **STOP and VALIDATE**：執行 `npm test` 並依 quickstart §6 步驟 1–4、6 手動驗證
5. 可展示

### Incremental Delivery

1. Setup + Foundational → 骨架可啟動
2. US1 → 帳號與登入（MVP）
3. US2 → 權限、登出、逾時完整
4. US3 + US4 → 分組完整（搶答前置作業完成）
5. US5 → 帳號維護
6. US6 → RWD 收尾
7. Polish → 設計一致性、機敏資料、併發驗證與完成回報

### Parallel Team Strategy

1. 全組一起完成 Setup + Foundational
2. US1 完成後：
   - 組員 A：US2 → US6
   - 組員 B：US3 → US4
   - 組員 C：US5
3. 最後一起完成 Phase 9

---

## Notes

- [P] = 不同檔案且無未完成相依
- 每個任務完成後執行相關測試；每個 checkpoint 執行 `npm test`
- 任何與 `diagrams/*.puml` 不一致的實作，先改圖、重新產生 PNG、更新 plan.md 對照表，再改程式（憲章原則 VI）
- 不得在程式碼、測試、文件中寫入真實密碼；測試一律使用虛構值（憲章原則 III）

## Phase 10: Convergence

- [X] T084 CRITICAL：backend/package.json 的 zod 已升為 ^4.6.7，但 backend/src/config/env.ts、backend/src/middleware/validate.ts、backend/src/schemas/auth.ts、backend/src/schemas/students.ts、backend/src/schemas/groups.ts 仍使用 zod 3 API（共 17 個型別錯誤），使 `npm run typecheck` 失敗、`npm test` 有 4 個測試失敗；將上述檔案遷移至 zod 4 API（與 main 分支的 zod ^4.6.7 一致），或將依賴釘回 zod 3 並更新 package-lock.json，直到 `npm test`、`npm run lint`、`npm run typecheck` 全部通過 per Constitution IV (contradicts)
- [X] T085 恢復缺漏、型別錯誤與列舉不符時的中文錯誤訊息：zod 4 會忽略 `required_error`／`invalid_type_error`／`errorMap`，改用 `error` 參數，使 body 缺欄位、組數為 null 或字串 "4"、NODE_ENV 不合法時，仍回傳 `msg(message, hint)` 格式的欄位、原因與修正方式（backend/src/schemas/*.ts、backend/src/config/env.ts、backend/src/middleware/validate.ts），並確認 tests/integration/groups.manage.test.ts 的邊界案例通過 per FR-002 (contradicts)
- [X] T086 修正 backend/src/config/env.ts 中 PORT 與 SESSION_IDLE_MINUTES 的預設值：zod 4 的 `.default()` 不會再經過 transform，以致 `Config.port` 變成字串 '3000'；改為讓預設值也轉成數字（例如 `.default(3000)` 或 `prefault`），使 tests/unit/config.test.ts 通過、`sessionIdleTimeout` 為數字毫秒 per FR-001 (contradicts)
- [X] T087 在 specs/001-foundation-auth-groups/plan.md「實作階段的設計變更」表記錄 zod 主版本的決定（升到 4 以與 main 一致，或維持 3），並在 T084–T086 完成後重新回報測試指令與實際結果 per Constitution V (partial)
