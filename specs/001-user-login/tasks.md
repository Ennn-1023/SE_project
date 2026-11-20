---

description: "F1 登入與身分驗證／權限控管 的實作任務清單"
---

# Tasks: 登入與身分驗證／權限控管（F1）

**Input**: Design documents from `/specs/001-user-login/`

**Prerequisites**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、[data-model.md](data-model.md)、[contracts/api.md](contracts/api.md)、[quickstart.md](quickstart.md)

**Tests**: 包含測試任務。憲章原則 IV 規定每個功能必須有正常案例與邊界案例測試，且驗證錯誤與錯誤訊息必須被測試覆蓋。測試先寫，確認失敗後再實作。

**Organization**: 任務依使用者故事分組，每個故事可獨立實作與測試。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行進行（不同檔案、不依賴未完成的任務）
- **[Story]**: 所屬使用者故事（US1–US6，對應 spec.md）
- 欄位限制以 `data-model.md` 的 `Entity.field` 為唯一來源，任務中只引用、不重述

## Path Conventions

- Web app + 共用套件：`backend/src/`、`backend/tests/`、`frontend/src/`、`frontend/tests/`、`shared/src/`（見 [plan.md](plan.md) Project Structure）

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立 npm workspaces 單一 repo 與前後端骨架（F0 的最小必要部分，見 research.md R13）

- [X] T001 建立根目錄 `package.json`：npm workspaces（`backend`、`frontend`、`shared`），scripts `dev`（同時啟動前後端）、`test`（執行所有 workspace 的 Vitest）、`seed`、`db:migrate`；並建立 `tsconfig.base.json`（`strict: true`）
- [X] T002 [P] 初始化共用套件 `shared/package.json`、`shared/tsconfig.json`（相依 zod），讓 backend 與 frontend 可 `import` 它
- [X] T003 [P] 初始化後端 `backend/package.json`、`backend/tsconfig.json`、`backend/vitest.config.ts`：相依 Express 5、zod、cookie-parser、pino；開發相依 vitest、supertest、tsx、@types/*（版本以 `package-lock.json` 鎖定）
- [X] T004 [P] 初始化前端 Vite + React + TypeScript：`frontend/package.json`、`frontend/index.html`、`frontend/src/main.tsx`、`frontend/vite.config.ts`（`/api` proxy 到 `http://localhost:3000`；Vitest 使用 jsdom 與 `frontend/tests/setup.ts` 載入 @testing-library/jest-dom）
- [X] T005 [P] 設定 Tailwind CSS v4 與 design tokens 於 `frontend/src/styles/index.css`：以 `@theme` 定義米白底色（`#FAF7F0`／`#F5F0E6`）、撞色按鈕（深藍 `#1F3A93`、珊瑚橘 `#FF6B4A`）、斷點（640px／1024px）
- [X] T006 [P] 設定 ESLint 與 Prettier：`eslint.config.js`、`.prettierrc`，根目錄加 `lint` script
- [X] T007 [P] 更新 `.env.template`：列出 research.md R8 的所有變數名稱與說明（`DATABASE_URL`、`SESSION_SECRET`、`STUDENT_DEFAULT_PASSWORD`、`TEACHER_INITIAL_PASSWORD`、`TEACHER_USERNAME`、`PORT`、`NODE_ENV`），**不填任何值**

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有使用者故事共用的資料表、驗證、錯誤格式、session、權限中介層與前端外殼

**⚠️ CRITICAL**: 本階段完成前不可開始任何使用者故事

### 共用驗證與錯誤格式

- [X] T008 [P] 在 `shared/src/errors.ts` 定義錯誤 code 列舉與 `ErrorResponse` 型別（`code`、`message`、`hint`、`details[]`），對照 contracts/api.md「統一錯誤格式」表
- [X] T009 [P] 在 `shared/src/schemas/auth.ts` 以 zod 實作 `loginInput`、`changePasswordInput`，規則依 data-model.md「輸入驗證規則總表」（`loginInput.username` 對應 data-model.md `User.username`）；每個錯誤附中文 `message` 與 `hint`
- [X] T010 [P] 在 `shared/src/schemas/students.ts` 以 zod 實作 `createStudentInput` 與 `studentIdParam`：`studentId` 依 data-model.md `User.username`（學生）、`name` 依 data-model.md `User.displayName`、`group` 依 data-model.md `User.groupLabel`；空字串組別轉為 `null`
- [X] T011 在 `shared/src/index.ts` 匯出所有 schema、型別（`Role`、`CurrentUser`、`StudentSummary`，見 contracts/api.md「共用物件」）與錯誤 code

### 資料庫

- [X] T012 在 `backend/src/db/migrations.ts` 以 SQL 定義三個資料表並實作 `migrate(db)`（依 `PRAGMA user_version` 套用、開啟 `foreign_keys`）：
  - `User`：data-model.md `User.id`、`User.username`（UNIQUE）、`User.displayName`、`User.role`（enum）、`User.groupLabel`、`User.passwordHash`、`User.usesDefaultPassword`、`User.passwordChangedAt`、`User.createdById`、`User.createdAt`
  - `Session`：data-model.md `Session.id`、`Session.tokenHash`（UNIQUE）、`Session.userId`（ON DELETE CASCADE）、`Session.createdAt`、`Session.lastSeenAt`、`Session.expiresAt`
  - `SecurityEvent`：data-model.md `SecurityEvent.id`、`SecurityEvent.type`（enum）、`SecurityEvent.actorUsername`、`SecurityEvent.targetUsername`、`SecurityEvent.occurredAt`（無外鍵）
- [X] T013 [P] 在 `backend/src/lib/db.ts` 實作 `openDatabase(databaseUrl)`：解析 `file:` 路徑或 `:memory:`，以 `node:sqlite` 開啟並呼叫 `migrate`

### 後端基礎函式庫

- [X] T014 [P] 在 `backend/src/config/env.ts` 以 zod 驗證 `process.env`（規則見 research.md R8；`TEACHER_USERNAME` 另依 data-model.md `User.username`（老師）不可為 9 位數字）；失敗時輸出**所有**缺少／不合法的變數名稱與原因（不含值）並 `process.exit(1)`；匯出型別化的 `env`
- [X] T015 [P] 在 `backend/src/lib/password.ts` 實作 `hashPassword` 與 `verifyPassword`（scrypt 參數與儲存格式見 research.md R4，對應 data-model.md `User.passwordHash`；比對使用 `timingSafeEqual`），另匯出啟動時產生的 `dummyHash` 供 R6 使用
- [X] T016 [P] 在 `backend/src/lib/clock.ts` 實作可注入的時鐘（`now()`），供 session 逾時與測試使用
- [X] T017 [P] 在 `backend/src/lib/logger.ts` 建立 pino logger，`redact` 遮罩 `password`、`currentPassword`、`newPassword`、`confirmPassword`、`cookie`、`authorization`、`*.passwordHash`（research.md R10）

### Session、稽核與中介層

- [X] T018 在 `backend/src/services/sessionService.ts` 實作：`createSession(userId)`（32-byte 隨機 token，只存 SHA-256 至 data-model.md `Session.tokenHash`；設定 `Session.expiresAt`＝登入＋12 小時）、`resolveSession(token)`（依 data-model.md「有效條件」檢查 `Session.lastSeenAt` 閒置 2 小時與 `Session.expiresAt`，失效即刪除並回傳過期原因；`lastSeenAt` 最多每 60 秒更新）、`revokeSession(id)`、`revokeAllForUser(userId, exceptSessionId?)`
- [X] T019 [P] 在 `backend/src/services/auditService.ts` 實作 `recordEvent(type, actorUsername?, targetUsername?)`，寫入 data-model.md `SecurityEvent.type`、`SecurityEvent.actorUsername`（截斷規則見 data-model.md）、`SecurityEvent.targetUsername`、`SecurityEvent.occurredAt`；絕不接收密碼參數
- [X] T020 [P] 在 `backend/src/middleware/validate.ts` 實作 `validate({ body?, params? })`：以 shared zod schema 驗證，失敗回 400 `VALIDATION_ERROR` 並在 `details` 列出所有出錯欄位
- [X] T021 [P] 在 `backend/src/middleware/errorHandler.ts` 實作統一錯誤處理：`AppError` 類別 → 對應狀態碼與 code；body 過大 → 413 `PAYLOAD_TOO_LARGE`；非 JSON POST → 415；其他 → 500 `INTERNAL_ERROR`（只 log 不含機敏資料的錯誤，不回傳 stack）
- [X] T022 在 `backend/src/middleware/requireAuth.ts` 讀取簽章 cookie `sid`，呼叫 `resolveSession`；無／竄改 cookie → 401 `UNAUTHENTICATED`，逾時 → 401 `SESSION_EXPIRED` 並清除 cookie；成功時把目前使用者（含 data-model.md `User.role`）與 session id 放到 `req`
- [X] T023 [P] 在 `backend/src/middleware/requireRole.ts` 實作 `requireRole("TEACHER" | "STUDENT")`：只依 data-model.md `User.role` 判斷，不符回 403 `FORBIDDEN`「權限不足」
- [X] T024 在 `backend/src/app.ts` 實作 `createApp({ clock })`：`express.json({ limit: "10kb" })`、有內容的 POST 必須 `application/json`（無內容的 POST 不檢查，見 contracts/api.md 開頭規則）、`cookie-parser(env.SESSION_SECRET)`、掛載 `/api/auth` 與 `/api/students` 路由（先建立空 router 檔 `backend/src/routes/auth.ts`、`backend/src/routes/students.ts`）、最後掛 errorHandler；在 `backend/src/server.ts` 載入 env 後 listen `PORT`
- [X] T025 [P] 在 `backend/tests/helpers/testApp.ts` 建立測試工具：注入假的 env 值（不使用真實預設密碼）、每個測試檔使用獨立暫存 SQLite 並套用 migration、可控制的假時鐘、`createUser({ username, role, password })` 直接寫入 DB、`loginAs()` 取得 cookie

### 前端外殼

- [X] T026 [P] 在 `frontend/src/api/client.ts` 實作 fetch 包裝：自動帶 `Content-Type: application/json` 與 `credentials: "same-origin"`；解析 `ErrorResponse`；**只有**收到 401 且 `code` 為 `UNAUTHENTICATED` 或 `SESSION_EXPIRED` 時才清除目前使用者並導向 `/login`（`SESSION_EXPIRED` 時帶上逾時原因）；其他 401（`INVALID_CREDENTIALS`、`WRONG_CURRENT_PASSWORD`）照一般錯誤丟給呼叫端處理（見 contracts/api.md「前端路由」）；並在 `frontend/tests/apiClient.test.ts` 測試這兩種分流
- [X] T027 [P] 在 `frontend/src/auth/AuthContext.tsx` 實作目前使用者 context：啟動時呼叫 `GET /api/auth/me`，提供 `user`、`setUser`、`loading`
- [X] T028 [P] 在 `frontend/src/components/` 建立共用元件 `Button.tsx`（撞色、`min-h-11` ≥ 44px）、`TextField.tsx`（label、欄位錯誤訊息）、`ErrorMessage.tsx`（顯示 `message` 與 `hint`）、`ConfirmDialog.tsx`（確認／取消）
- [X] T029 在 `frontend/src/App.tsx` 建立 React Router 路由骨架（`/login`、`/teacher`、`/teacher/students`、`/student`、`/account/password`，見 contracts/api.md「前端路由」），頁面先用 placeholder；`frontend/src/main.tsx` 包上 `AuthContext` 並引入 `styles/index.css`

### Foundational 測試

- [X] T030 [P] 在 `backend/tests/unit/env.test.ts` 測試：全部合法時通過；缺少 `SESSION_SECRET` 時訊息含變數名稱且**不含任何值**；`STUDENT_DEFAULT_PASSWORD` 7 字元被拒；`TEACHER_USERNAME` 為 9 位數字被拒；未設 `TEACHER_USERNAME` 時預設為 `teacher`
- [X] T031 [P] 在 `backend/tests/unit/password.test.ts` 測試：同一密碼兩次雜湊結果不同、正確密碼驗證成功、錯誤密碼失敗、前後含空白的密碼不被修剪
- [X] T032 [P] 在 `backend/tests/unit/schemas.test.ts` 測試 shared schema：`411000001` 通過、`000123456` 通過且保留開頭 0、8 碼／10 碼／含字母／全形數字被拒、學號前後空白被去除、姓名空白或 51 字元被拒、組別 21 字元被拒、多個欄位同時錯誤時全部列出、新密碼 7／65 字元被拒、兩次新密碼不一致被拒
- [X] T033 [P] 在 `backend/tests/unit/session.test.ts` 以假時鐘測試：閒置 1 小時 59 分仍有效、閒置 2 小時失效、持續活動但登入滿 12 小時失效、`lastSeenAt` 60 秒內不重複寫入、`revokeAllForUser` 可保留指定 session

**Checkpoint**: 基礎完成，`npm test` 中 Foundational 測試通過，可開始使用者故事

---

## Phase 3: User Story 1 - 學生以學號＋預設密碼登入並進入搶答頁 (Priority: P1) 🎯 MVP

**Goal**: 學生以 9 位數字學號與預設密碼登入，直接進入學生搶答頁（不強制改密碼）；錯誤時不洩漏帳號是否存在

**Independent Test**: 用測試工具直接建立一個學生帳號，以正確密碼登入被導向 `/student`；錯誤密碼與不存在的學號得到完全相同的回應

### Tests for User Story 1 ⚠️

> **NOTE: 先寫測試並確認失敗，再實作**

- [X] T034 [P] [US1] 在 `backend/tests/integration/auth.login.test.ts` 測試 `POST /api/auth/login` 與 `GET /api/auth/me`：學生登入成功回 200、`redirectTo: "/student"`、`Set-Cookie` 為 HttpOnly＋SameSite=Strict；錯誤密碼與不存在學號 `499999999` 回應 body 完全相同（401 `INVALID_CREDENTIALS`）；以 `vi.spyOn` 監看 `verifyPassword`，確認學號不存在時也被呼叫恰好一次（FR-009、research.md R6，不直接比較耗時以免測試不穩定）；帳號／密碼皆空時 `details` 同時列兩欄；帳號 21 字元被拒；10,000 字元 body 回 413；連續 10 次錯誤後正確密碼立即成功（FR-010）；成功與失敗皆寫入 `SecurityEvent` 且 DB 中無密碼字串；`/me` 未登入回 401、登入後回 `CurrentUser` 且不含 `passwordHash`
- [X] T035 [P] [US1] 在 `frontend/tests/LoginPage.test.tsx` 測試：空欄位送出時顯示欄位錯誤且不呼叫 API；API 回 401 `INVALID_CREDENTIALS` 時留在登入頁顯示「學號或密碼錯誤」，且已輸入的學號不被清空；成功時導向 `redirectTo`；已登入時開啟 `/login` 直接導向自己的首頁（FR-011）

### Implementation for User Story 1

- [X] T036 [US1] 在 `backend/src/services/authService.ts` 實作 `login(username, password)`：依 data-model.md `User.username` 查詢；帳號不存在時對 `dummyHash` 做一次 `verifyPassword`（research.md R6）；失敗統一丟 `INVALID_CREDENTIALS`；成功建立 session、記錄 `LOGIN_SUCCESS`／`LOGIN_FAILURE`；回傳 `CurrentUser`（含 data-model.md `User.usesDefaultPassword`）與依 data-model.md `User.role` 決定的 `redirectTo`
- [X] T037 [US1] 在 `backend/src/routes/auth.ts` 實作 `POST /login`（`validate(loginInput)`，設定簽章 cookie `sid`：HttpOnly、SameSite=Strict、`NODE_ENV=production` 時 Secure）與 `GET /me`（`requireAuth`）
- [X] T038 [US1] 在 `frontend/src/pages/LoginPage.tsx` 實作登入表單：送出前用 shared `loginInput` 驗證、顯示 API 錯誤、成功後 `setUser` 並導向 `redirectTo`；若網址帶逾時原因則顯示「登入已逾時，請重新登入」；米白底＋撞色按鈕，375px 寬無水平捲動
- [X] T039 [US1] 在 `frontend/src/pages/StudentHomePage.tsx` 實作學生首頁：顯示「等待老師開放題目」；`usesDefaultPassword` 為 true 時顯示不阻擋操作的「建議修改密碼」提示與 `/account/password` 連結（US6-4、FR-018）
- [X] T040 [US1] 在 `frontend/src/App.tsx` 接上 `/login` 與 `/student` 實際頁面，`/login` 在已登入時依角色導向

**Checkpoint**: 學生可登入並看到學生首頁；T034、T035 通過

---

## Phase 4: User Story 2 - 老師登入並進入管理頁 (Priority: P1)

**Goal**: 系統初始化時建立老師帳號（冪等）；老師登入後進入老師管理頁

**Independent Test**: 執行 seed 後以老師帳號登入被導向 `/teacher`；再次 seed 不會覆寫已變更的老師密碼

### Tests for User Story 2 ⚠️

- [X] T041 [P] [US2] 在 `backend/tests/integration/seed.test.ts` 測試：空資料庫執行 `ensureTeacher()` 建立一個 `role=TEACHER` 帳號；重複執行不新增也不改 `passwordHash`；先手動改老師密碼後再執行，舊的已變更密碼仍可登入；老師登入回 `redirectTo: "/teacher"`

### Implementation for User Story 2

- [X] T042 [US2] 在 `backend/src/seed.ts` 實作 `ensureTeacher()`：只在沒有 data-model.md `User.role` 為 `TEACHER` 的帳號時建立，`User.username` 取 `env.TEACHER_USERNAME`、`User.displayName` 為「老師」、`User.usesDefaultPassword` 為 true、`User.createdById` 為 null；可單獨執行（根目錄 `npm run seed`），並在 `backend/src/server.ts` 啟動時呼叫；輸出「已建立」或「已存在、未變更」，不印出密碼
- [X] T043 [US2] 在 `frontend/src/pages/TeacherHomePage.tsx` 實作老師管理首頁（歡迎文字、前往「學生帳號管理」連結），並在 `frontend/src/App.tsx` 接上 `/teacher`

**Checkpoint**: 老師與學生皆可登入並各自被導向正確頁面

---

## Phase 5: User Story 3 - 老師新增學生帳號 (Priority: P1)

**Goal**: 老師逐一新增學生帳號（學號＋姓名＋選填組別）、檢視清單、刪除帳號（需確認）

**Independent Test**: 老師新增一位學生後，該學生出現在清單並能以預設密碼登入；重複學號被拒；刪除後該學生無法登入且可重新新增

### Tests for User Story 3 ⚠️

- [X] T044 [P] [US3] 在 `backend/tests/integration/students.test.ts` 測試：新增成功回 201 且 `usesDefaultPassword=true`、該學生可用預設密碼登入；組別被保存、空字串組別存為 null；重複學號回 409 `ACCOUNT_EXISTS` 且原帳號 `passwordHash` 不變；兩個同時送出的相同學號只有一個 201；學號 8 碼且姓名空白時 `details` 同時列兩欄；`GET` 依學號遞增排序且回應中沒有任何密碼欄位；刪除回 204、該學生所有 session 失效（舊 cookie 回 401）、再登入得到 `INVALID_CREDENTIALS`、可再次新增同學號；刪除不存在學號回 404 `STUDENT_NOT_FOUND`；路徑學號格式錯誤回 400；新增與刪除皆寫入 `SecurityEvent`
- [X] T045 [P] [US3] 在 `frontend/tests/StudentsPage.test.tsx` 測試：新增表單欄位錯誤顯示、成功後清單更新並顯示「已新增學生 411000001（姓名）」、409 時顯示「學號已存在」；刪除時先顯示確認對話框，按取消不呼叫 API、按確認才呼叫

### Implementation for User Story 3

- [X] T046 [US3] 在 `backend/src/services/studentService.ts` 實作 `createStudent`（`User.passwordHash` 以 `env.STUDENT_DEFAULT_PASSWORD` 雜湊、data-model.md `User.role`＝`STUDENT`、`User.usesDefaultPassword`＝true、`User.createdById`＝目前老師；UNIQUE 衝突轉為 409）、`listStudents`（只回 data-model.md `User.role` 為 `STUDENT` 者，映射為 `StudentSummary`，排除 `User.passwordHash`）、`deleteStudent`（只刪 `role=STUDENT`，否則 404；session 由 cascade 刪除）；新增與刪除呼叫 `auditService`
- [X] T047 [US3] 在 `backend/src/routes/students.ts` 實作 `GET /`、`POST /`（`validate(createStudentInput)`）、`DELETE /:studentId`（`validate(studentIdParam)`），router 層套用 `requireAuth` 與 `requireRole("TEACHER")`
- [X] T048 [US3] 在 `frontend/src/pages/StudentsPage.tsx` 實作學生帳號管理頁：新增表單（學號、姓名、組別；送出前以 shared `createStudentInput` 驗證）、學生清單（學號、姓名、組別、是否仍用預設密碼；手機寬度改為卡片式不水平捲動）、每列「刪除」按鈕搭配 `ConfirmDialog`
- [X] T049 [US3] 在 `frontend/src/App.tsx` 接上 `/teacher/students`

**Checkpoint**: M1 Demo 主流程可運作：老師新增學生 → 學生登入

---

## Phase 6: User Story 4 - 角色權限控管 (Priority: P1)

**Goal**: 學生無法使用任何老師功能（後端拒絕，不只靠前端隱藏）；未登入者被要求登入

**Independent Test**: 以學生身分直接呼叫每一個老師 API 皆得 403 且沒有副作用；未登入呼叫得 401

### Tests for User Story 4 ⚠️

- [X] T050 [P] [US4] 在 `backend/tests/integration/rbac.test.ts` 測試：學生呼叫 `GET /api/students`、`POST /api/students`、`DELETE /api/students/:id`、`POST /api/students/:id/reset-password` 全部回 403 `FORBIDDEN`「權限不足」，且資料庫學生數、密碼雜湊皆未改變；未登入呼叫上述與 `/api/auth/me` 回 401；竄改簽章的 cookie 回 401；老師呼叫回正常結果
- [X] T051 [P] [US4] 在 `frontend/tests/RequireRole.test.tsx` 測試：未登入進 `/teacher` 導向 `/login`；學生進 `/teacher/students` 導向 `/student`；老師進 `/student` 導向 `/teacher`

### Implementation for User Story 4

- [X] T052 [US4] 在 `frontend/src/auth/RequireRole.tsx` 實作路由守衛（依 `CurrentUser.role` 導向，見 contracts/api.md「前端路由」），並在 `frontend/src/App.tsx` 套用到 `/teacher`、`/teacher/students`、`/student`、`/account/password`

**Checkpoint**: 所有 P1 故事完成；權限由後端與前端雙重把關

---

## Phase 7: User Story 5 - 登出與閒置逾時 (Priority: P2)

**Goal**: 使用者可登出且立即失效；閒置 2 小時或登入滿 12 小時自動失效並提示重新登入

**Independent Test**: 登出後舊 cookie 回 401；以假時鐘推進 2 小時後任一受保護請求回 `SESSION_EXPIRED`

### Tests for User Story 5 ⚠️

- [X] T053 [P] [US5] 在 `backend/tests/integration/auth.session.test.ts` 測試：登出回 204 並清除 cookie、再用舊 cookie 呼叫 `/me` 回 401；未登入呼叫登出也回 204；不帶 `Content-Type` 也沒有內容的登出請求回 204（不被 415 擋下）；以 `text/plain` 送出有內容的登入請求回 415 `UNSUPPORTED_MEDIA_TYPE`；假時鐘推進 2 小時後回 401 `SESSION_EXPIRED`；每 30 分鐘活動一次但推進到 12 小時後回 `SESSION_EXPIRED`；登出寫入 `LOGOUT` 事件
- [X] T054 [P] [US5] 在 `frontend/tests/session.test.tsx` 測試：按登出後導向 `/login` 且 context 清空；任一 API 回 `SESSION_EXPIRED` 時導向 `/login` 並顯示「登入已逾時，請重新登入」

### Implementation for User Story 5

- [X] T055 [US5] 在 `backend/src/services/authService.ts` 加入 `logout(sessionId)`（刪除 session、記錄 `LOGOUT`），並在 `backend/src/routes/auth.ts` 實作 `POST /logout`（冪等、清除 cookie）
- [X] T056 [US5] 在 `frontend/src/components/AppHeader.tsx` 實作頁首（顯示使用者名稱與「登出」按鈕），套用到老師與學生頁面

**Checkpoint**: 登出與逾時行為符合 FR-015、FR-016

---

## Phase 8: User Story 6 - 自行修改密碼與老師重設學生密碼 (Priority: P2)

**Goal**: 使用者可（非強制）修改密碼並讓其他裝置登出；老師可將學生密碼重設回預設並讓其所有裝置登出

**Independent Test**: 學生改密碼後新密碼可登入、舊密碼不行、其他裝置被登出；老師重設後學生可用預設密碼登入

### Tests for User Story 6 ⚠️

- [X] T057 [P] [US6] 在 `backend/tests/integration/auth.password.test.ts` 測試：改密碼成功回 204、`usesDefaultPassword` 變 false、目前 session 仍有效、同帳號另一 session 回 401；目前密碼錯誤回 401 `WRONG_CURRENT_PASSWORD`；新密碼等於預設密碼回 400 `PASSWORD_IS_DEFAULT`；7 字元與兩次不一致回 400；老師重設回 204、學生所有 session 失效、預設密碼可登入、`usesDefaultPassword` 變 true；重設不存在學號回 404；不帶 `Content-Type` 的重設請求仍回 204；改密碼與重設皆寫入 `SecurityEvent`
- [X] T058 [P] [US6] 在 `frontend/tests/ChangePasswordPage.test.tsx` 測試：兩次新密碼不一致時顯示錯誤且不呼叫 API；`PASSWORD_IS_DEFAULT` 時顯示「不得與預設密碼相同」；API 回 401 `WRONG_CURRENT_PASSWORD` 時留在本頁顯示「目前密碼錯誤」，使用者**未被登出**也未跳轉到 `/login`；成功時顯示成功訊息；學生清單「重設密碼」需確認才呼叫 API

### Implementation for User Story 6

- [X] T059 [US6] 在 `backend/src/services/authService.ts` 實作 `changePassword(userId, sessionId, input)`：驗證目前密碼、拒絕等於 `env.STUDENT_DEFAULT_PASSWORD` 的新密碼、更新 data-model.md `User.passwordHash`、`User.usesDefaultPassword`（false）、`User.passwordChangedAt`，呼叫 `revokeAllForUser(userId, sessionId)`、記錄 `PASSWORD_CHANGED`；並在 `backend/src/routes/auth.ts` 實作 `POST /password`（`requireAuth`、`validate(changePasswordInput)`）
- [X] T060 [US6] 在 `backend/src/services/studentService.ts` 實作 `resetPassword(studentId, actor)`：只作用於 data-model.md `User.role` 為 `STUDENT` 者（否則 404），以預設密碼重新雜湊 `User.passwordHash`、設 `User.usesDefaultPassword` 為 true、更新 `User.passwordChangedAt`、`revokeAllForUser`、記錄 `PASSWORD_RESET`；並在 `backend/src/routes/students.ts` 實作 `POST /:studentId/reset-password`
- [X] T061 [US6] 在 `frontend/src/pages/ChangePasswordPage.tsx` 實作修改密碼頁（目前密碼、新密碼、確認新密碼；送出前用 shared `changePasswordInput` 驗證），並在 `frontend/src/App.tsx` 接上 `/account/password`
- [X] T062 [US6] 在 `frontend/src/pages/StudentsPage.tsx` 每列加入「重設密碼」按鈕搭配 `ConfirmDialog`，成功後重新載入清單

**Checkpoint**: 所有使用者故事完成且可獨立驗證

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 效能、安全、RWD 與交付前檢查

- [X] T063 [P] 在 `backend/tests/integration/auth.load.test.ts` 測試 SC-002：50 個學生帳號同時登入，全部成功且每個請求耗時 ≤ 2 秒
- [X] T064 [P] 在 `backend/tests/unit/logger.test.ts` 測試 logger redact：記錄含 `password`、`newPassword`、`cookie` 的物件時輸出中不出現原值
- [X] T065 [P] 檢查 `frontend/src/pages/*.tsx` 與 `frontend/src/components/*.tsx` 的 RWD：375px 與 1440px 寬無水平捲動、按鈕 ≥ 44px、只使用 `styles/index.css` 中的 design tokens（SC-008）
- [X] T066 [P] 在根目錄 `README.md` 加入安裝、設定 `.env`、`npm run db:migrate`、`npm run seed`、`npm run dev`、`npm test` 的說明（連結到 specs/001-user-login/quickstart.md）
- [X] T067 機敏資料檢查：搜尋整個 repo 確認沒有實際密碼、金鑰或 `.env` 被追蹤（`git ls-files` 與 diff 檢查），確認 `.env.template` 只有變數名稱
- [X] T068 執行 `npm run lint` 與 `npm test`，記錄確切指令與實際通過／失敗數量（憲章原則 V），有失敗則修正後重跑
- [X] T069 依 specs/001-user-login/quickstart.md 逐一執行手動驗證情境 1–16 並記錄結果

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：無相依，可立即開始
- **Foundational (Phase 2)**：依賴 Setup 完成；**阻擋所有使用者故事**
- **使用者故事 (Phase 3–8)**：皆依賴 Foundational 完成
- **Polish (Phase 9)**：依賴所有使用者故事完成

### User Story Dependencies

- **US1 學生登入 (P1)**：Foundational 後即可開始；測試以 helper 直接建立學生帳號，不依賴 US3
- **US2 老師登入 (P1)**：Foundational 後即可開始；重用 US1 的 `POST /api/auth/login`（若 US1 未完成，先完成 T036–T037）
- **US3 新增學生帳號 (P1)**：Foundational 後即可開始；前端頁面的入口連結在 US2 的 `TeacherHomePage`，但 API 與頁面可獨立測試
- **US4 權限控管 (P1)**：後端中介層已在 Foundational；本階段測試需要 US3 的學生 API 與 US6 的 reset 端點存在（reset 端點未完成時該項測試先標記 `todo`）
- **US5 登出與逾時 (P2)**：Foundational 後即可開始（逾時判斷已在 T018／T022）
- **US6 修改／重設密碼 (P2)**：後端改密碼可獨立開始；重設密碼與前端按鈕依賴 US3 的 `studentService.ts` 與 `StudentsPage.tsx`

### Within Each User Story

- 測試先寫並確認失敗
- service → route → 前端頁面 → 路由接線
- 每個故事完成並通過測試後再進入下一個優先順序

### 同檔案衝突提醒

- `backend/src/services/authService.ts`：T036 → T055 → T059 依序
- `backend/src/routes/auth.ts`：T037 → T055 → T059 依序
- `backend/src/services/studentService.ts`、`backend/src/routes/students.ts`：T046／T047 → T060
- `frontend/src/App.tsx`：T029 → T040 → T043 → T049 → T052 → T061
- `frontend/src/pages/StudentsPage.tsx`：T048 → T062

### Parallel Opportunities

- Setup：T002–T007 可同時進行
- Foundational：T008–T010、T013–T017、T019–T021、T023、T025–T028、T030–T033 標記 [P] 者可同時進行
- 每個故事的兩個測試任務（後端、前端）可同時進行
- Foundational 完成後，US1、US3、US5 可由不同組員同時進行

---

## Parallel Example: User Story 1

```bash
# 同時撰寫 US1 的測試：
Task: "T034 在 backend/tests/integration/auth.login.test.ts 撰寫登入 API 測試"
Task: "T035 在 frontend/tests/LoginPage.test.tsx 撰寫登入頁測試"

# 後端 T036 → T037 完成後，前端頁面可同時進行：
Task: "T038 在 frontend/src/pages/LoginPage.tsx 實作登入頁"
Task: "T039 在 frontend/src/pages/StudentHomePage.tsx 實作學生首頁"
```

## Parallel Example: Foundational

```bash
Task: "T014 backend/src/config/env.ts 環境變數驗證"
Task: "T015 backend/src/lib/password.ts scrypt 雜湊"
Task: "T016 backend/src/lib/clock.ts 可注入時鐘"
Task: "T017 backend/src/lib/logger.ts pino redact"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1：Setup
2. 完成 Phase 2：Foundational（關鍵，阻擋所有故事）
3. 完成 Phase 3：US1 學生登入
4. **停下來驗證**：`npm test` 通過，且以 helper 建立的學生可登入
5. 視需要展示

### Incremental Delivery（對應 roadmap M1）

1. Setup + Foundational → 基礎就緒
2. US1 → 學生可登入（MVP）
3. US2 → 老師可登入
4. US3 → 老師新增學生，**M1 登入部分的 Demo 主流程完成**
5. US4 → 權限雙重把關
6. US5、US6 → 登出逾時、密碼管理
7. Polish → 效能、安全檢查、回報測試結果

### Parallel Team Strategy

1. 全組一起完成 Setup + Foundational
2. 之後分工：
   - 組員 A：US1 → US2（登入流程）
   - 組員 B：US3 → US6 的重設密碼（學生帳號管理）
   - 組員 C：US5 → US6 的自行改密碼 → US4 測試
3. 注意上方「同檔案衝突提醒」，同一檔案的任務由同一人依序完成

---

## Notes

- [P] = 不同檔案、無相依
- [Story] 標籤對應 spec.md 的使用者故事
- 每個故事可獨立完成與測試
- 測試先失敗再實作
- 每完成一個任務或一組邏輯相關任務就 commit；commit 前檢查 diff 沒有機敏資料
- 任何測試都不得使用 `.env` 中的真實密碼
