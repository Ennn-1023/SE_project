---

description: "Task list for 001-student-buzzer"
---

# Tasks: 學生端搶答系統（Student Buzzer）

**Input**: Design documents from `specs/001-student-buzzer/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**Tests**: 依憲章原則 IV（不可妥協），每個 story 都包含正常案例與邊界案例測試。測試編號 Q-T1～Q-T20 對應 [quickstart.md §4](quickstart.md) 的測試清單。測試要先寫，並確認在實作前會失敗。

**Organization**: 依 user story 分組；spec 的 P1 故事（US1–US3）優先，接著是 P2（US6、US4），最後是 P3（US5）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可以平行進行（不同檔案、沒有未完成的相依任務）
- **[Story]**：所屬的 user story（US1–US6，對應 spec.md）
- 欄位限制以 `data-model.md` 的 `Entity.field` 為準，任務中只引用，不重複抄寫

## Path Conventions

- npm workspaces：`shared/src/`、`backend/src/`、`backend/tests/`、`frontend/src/`、`frontend/tests/`（見 plan.md 的 Project Structure）

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立 monorepo 與工具鏈

- [X] T001 建立根目錄 `package.json`（npm workspaces：`shared`、`backend`、`frontend`；scripts：`dev` 同時啟動前後端、`test` 依序執行各 workspace 測試），並加入 `.nvmrc`（內容為 `22`）
- [X] T002 [P] 初始化 `shared/package.json`、`shared/tsconfig.json`（strict）與 `shared/vitest.config.ts`
- [X] T003 [P] 初始化 `backend/package.json`（相依：express、socket.io、better-sqlite3、zod、jsonwebtoken、cors、dotenv；dev 相依：typescript、tsx、vitest、supertest、socket.io-client 與各套件型別），以及 `backend/tsconfig.json`、`backend/vitest.config.ts`
- [X] T004 [P] 以 Vite React-TS 範本初始化 `frontend/`（`frontend/package.json` 加入 socket.io-client；dev 相依：vitest、jsdom、@testing-library/react、@testing-library/user-event），設定 `frontend/vite.config.ts` 將 `/api` 與 `/socket.io` proxy 到 `http://localhost:3000`，並建立 `frontend/vitest.config.ts`
- [X] T005 [P] 設定共用 ESLint 與 Prettier（根目錄 `eslint.config.js`、`.prettierrc`），加入禁止 `dangerouslySetInnerHTML` 的規則（`react/no-danger`）
- [X] T006 [P] 更新 `.env.template`，加入 `SESSION_SECRET`、`PORT`、`SQLITE_PATH`、`CLIENT_ORIGIN`、`ENABLE_DEV_TOOLS`、`NODE_ENV` 的變數名稱與註解（不放實際值，見 research.md R11），並在 `.gitignore` 加入 `backend/data/*.db`
- [X] T007 執行 `npm install` 產生 `package-lock.json`，確認三個 workspace 的空測試都能以 `npm test` 跑完

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有 story 共用的核心——共用型別與規則、環境變數、資料庫、狀態機、驗證、錯誤處理、Socket 骨架、dev 登入與基本模擬操作、前端骨架

**⚠️ CRITICAL**: 這個階段完成前，不能開始任何 user story

### 共用（shared）

- [X] T008 [P] 在 `shared/src/types.ts` 定義 `ActivityPhase`（`data-model.md` Activity.phase）、`StudentView` 與 `TeamAnswer`（`data-model.md` StudentView 全部欄位、TeamAnswer）、`MyTeamOutcome`、`ErrorBody`（contracts/rest-api.md 錯誤格式）
- [X] T009 [P] 在 `shared/src/errorCodes.ts` 定義 contracts/rest-api.md 錯誤碼表中的所有 code、HTTP 狀態碼、中文 message 與 hint
- [X] T010 [P] 在 `shared/src/answerRules.ts` 實作 `MAX_ANSWER_LENGTH` 與 `validateAnswer()`，回傳去除前後空白後的值或錯誤碼（`data-model.md` Submission.answer；長度以 code point 計算，見 research.md R8）
- [X] T011 [P] 在 `shared/tests/answerRules.test.ts` 撰寫測試：空字串、只有空白、剛好 500 字、501 字、emoji 計為 1 字、去除前後空白（Q-T4、Q-T5 的規則部分）

### 後端基礎

- [X] T012 在 `backend/src/config/env.ts` 以 zod 驗證環境變數（`SESSION_SECRET` 至少 32 字元；`ENABLE_DEV_TOOLS=true` 搭配 `NODE_ENV=production` 時拒絕啟動），錯誤時只列出變數名稱、不顯示值，並以非 0 結束（憲章原則 III）
- [X] T013 [P] 在 `backend/tests/unit/env.test.ts` 測試：缺少 `SESSION_SECRET`、長度不足、production 搭配 dev tools 時報錯，且錯誤訊息不含變數的值
- [X] T014 在 `backend/src/data/db.ts` 建立 better-sqlite3 連線（路徑來自 `SQLITE_PATH`，測試使用 `:memory:`），並建立 `activities`、`questions`、`teams`、`students`、`submissions`、`question_results` 資料表，包含 `data-model.md` 定義的主鍵、外鍵與唯一限制（Submission 的 `(activity_id, question_id, team_id)` 與 `(activity_id, question_id, rank)`；QuestionResult 的 `(activity_id, question_id)`）
- [X] T015 在 `backend/src/data/mock/seed.ts` 寫入虛構 mock 資料：1 場活動、3 題（`data-model.md` Question.question_id、Question.number、Question.text）、4 組（`data-model.md` Team.name）、每組 1 位學生，其中一組有 2 位學生，另外 1 位學生 `data-model.md` Student.team_id 為 NULL（FR-021）；資料已存在時不重複寫入
- [X] T016 在 `backend/src/data/repositories.ts` 實作：讀寫目前活動（`data-model.md` Activity.id、Activity.phase、Activity.current_question_id、Activity.ends_at）、查詢題目／組別／學生、`hasResult(questionId)`、`listResults()`、`listSubmissions(questionId)`
- [X] T017 在 `backend/src/http/errors.ts` 定義 `AppError(code, field?, params?)`；在 `backend/src/http/middleware/errorHandler.ts` 依 `shared/src/errorCodes.ts` 輸出 `{ error: { code, field, message, hint } }`，未預期的錯誤一律回 500 `INTERNAL_ERROR`，不回傳 stack trace，log 不記錄 token
- [X] T018 在 `backend/src/domain/activityStateMachine.ts` 實作狀態機：`open`、`closeQuestion(reason)`（冪等）、`nextQuestion`、`endActivity`；依 `data-model.md` 狀態轉換表拒絕非法轉換；開放時設定 `endsAt` 並以 `setTimeout` 在時間到時觸發 `closeQuestion('TIME_UP')`；秒數驗證見 contracts/rest-api.md `INVALID_SECONDS`；提供 `onChange` 事件給推播使用
- [X] T019 [P] 在 `backend/tests/unit/activityStateMachine.test.ts` 以 fake timers 測試：正常轉換流程、時間到自動結束、時間到與手動結束同時觸發只結束一次（Q-T13）、作答中再開放被拒、秒數為 4／601／非整數被拒
- [X] T020 在 `backend/src/http/middleware/auth.ts` 實作 JWT 簽發與驗證（HS256，有效 8 小時，金鑰來自 `SESSION_SECRET`），從 token 的 studentId 查出學生與 `data-model.md` Student.team_id，掛到 `req.student`；失敗時回 401 `UNAUTHORIZED`
- [X] T021 在 `backend/src/http/routes/devAuth.ts` 實作 `GET /api/dev/students` 與 `POST /api/dev/login`（以 zod 驗證 studentId；不存在時回 400 `VALIDATION_ERROR`，見 contracts/rest-api.md）
- [X] T022 在 `backend/src/http/routes/devTeacher.ts` 實作 `POST /api/dev/teacher/open`、`/time-up`、`/close`、`/next`、`/end`、`/reset`（以 zod 驗證 body，呼叫狀態機；回傳格式見 contracts/rest-api.md）
- [X] T023 在 `backend/src/http/app.ts` 組裝 Express（json body 上限 16kb、cors 只允許 `CLIENT_ORIGIN`、`/api/student` 路由、只在 `ENABLE_DEV_TOOLS` 時掛載 `/api/dev`、errorHandler）
- [X] T024 在 `backend/src/realtime/socketServer.ts` 建立 `/student` namespace：handshake 驗證 token（失敗時以 `connect_error` 回傳 `UNAUTHORIZED`）、依組別加入 `team:{teamId}` 或 `student:{studentId}` room，並提供 `pushToTeam(teamId, view)` 與 `pushAll(buildViewFn)`（逐一對每個 room 分別推播，見 contracts/socket-events.md）
- [X] T025 在 `backend/src/server.ts` 載入 env → 開啟 DB → 執行 seed → 從資料庫恢復活動狀態 → 啟動 HTTP 與 Socket.IO；把狀態機的 `onChange` 接到 `pushAll`
- [X] T026 [P] 建立 `backend/tests/helpers/testServer.ts`：在隨機 port 啟動完整伺服器（`:memory:` DB、測試用 secret），並提供 `loginAs(studentId)`、`connectSocket(token)`、`teacher.open()` 等工具給整合測試使用
- [X] T027 [P] 在 `backend/tests/integration/auth.test.ts` 測試：沒有 token 或 token 錯誤時 REST 回 401、socket 收到 `connect_error`；dev 登入時學號不存在回 400；`ENABLE_DEV_TOOLS=false` 時 `/api/dev/*` 回 404（Q-T10）

### 前端基礎

- [X] T028 [P] 在 `frontend/src/styles/tokens.css` 定義 F0 設計系統：色票 CSS 變數（`--color-bg: #FAF7F0`、`--color-surface: #F5F0E6`、`--color-primary: #1F3A93`、`--color-accent: #FF6B4A`）、字級、間距、斷點 640px／1024px、`--touch-min: 44px`；並在 `frontend/src/styles/global.css` 設定 mobile-first 基礎樣式與 `overflow-x: hidden` 防護
- [X] T029 [P] 在 `frontend/src/api/client.ts` 實作 fetch 包裝：自動帶上 Bearer token、解析 `ErrorBody` 並丟出含 code、message、hint 的錯誤；token 存在 `sessionStorage`
- [X] T030 [P] 在 `frontend/src/realtime/socket.ts` 建立 socket.io-client 連線（`/student`、`auth.token`、自動重連，最長間隔 5 秒），提供 `onState`、`onConnectionChange` 訂閱
- [X] T031 在 `frontend/src/hooks/useStudentState.ts` 以 `useReducer` 管理 StudentView、連線狀態與 `clockOffset`（由 `serverNow` 計算）；啟動時呼叫 `GET /api/student/state`，並訂閱 `state:update`
- [X] T032 在 `frontend/src/pages/DevLoginPage.tsx` 列出 mock 學生並登入（呼叫 `/api/dev/login`，成功後存 token 並導向 `/`）；在 `frontend/src/App.tsx` 設定路由 `/`（StudentPage）與 `/dev`（DevLoginPage 加上 DevTeacherPanel 的位置）
- [X] T033 在 `frontend/src/pages/StudentPage.tsx` 依 `phase` 切換四個畫面元件（先放置空元件），沒有 token 時導向 `/dev`

**Checkpoint**: 基礎完成——伺服器可以啟動、dev 登入、模擬開放題目，學生頁可以收到 `state:update`

---

## Phase 3: User Story 1 - 組別搶答送出答案 (Priority: P1) 🎯 MVP

**Goal**: 等待畫面 → 作答中（題號、題目、作答區、倒數）→ 以組別送出 → 同組各分頁同步顯示「本組已送出」，且作答中看不到他組資料

**Independent Test**: 以 dev 開放 Q1，A 組代表開兩個分頁、B 組代表開一個分頁；B 先送、A 再送；A 的第二個分頁同步顯示已送出，A 再次送出被拒；A 的 socket 收不到 B 的資料（quickstart §5 步驟 1–4）

### Tests for User Story 1 ⚠️

- [X] T034 [P] [US1] 在 `backend/tests/unit/submissionService.test.ts` 測試：依送出順序指派 rank 1、2；同組第二次送出回 `ALREADY_SUBMITTED`；未分組回 `NO_TEAM`；questionId 不是目前開放的題目回 `QUESTION_NOT_OPEN`；空白答案與 501 字答案被拒
- [X] T035 [P] [US1] 在 `backend/tests/unit/visibilityFilter.test.ts` 測試隔離不變式：`ANSWERING` 時 `buildView` 序列化後的內容不含他組的 teamId、teamName、answer；只含本組的 `myTeamSubmission`（`data-model.md` StudentView.myTeamSubmission）
- [X] T036 [P] [US1] 在 `backend/tests/integration/submit.test.ts` 測試：`POST /api/student/submissions` 正常送出回 201 且不含 rank；同組多分頁同時送出時只有一筆成功、其他回 409（Q-T1、Q-T6）；空白或 501 字回 400 並包含 field、message、hint（Q-T4、Q-T5）；未分組回 403（Q-T9）；錯誤的 questionId 回 409（Q-T8）
- [X] T037 [P] [US1] 在 `backend/tests/integration/isolation.test.ts` 測試：作答中 A、B 兩組都連上 socket，B 送出後 A 收到的所有 payload 與 A 的 `GET /state` 都不含 B 的資料；B 的另一個 socket 收到 `myTeamSubmission`（Q-T11）
- [X] T038 [P] [US1] 在 `backend/tests/integration/concurrency.test.ts` 測試：10 組以 `Promise.all` 同時送出，rank 為 1–10 且不重複（Q-T12 的送出部分）
- [X] T039 [P] [US1] 在 `frontend/tests/AnsweringView.test.tsx` 測試：顯示題號、題目、倒數；字數計數；空白或超過 500 字時提示並禁止送出；送出期間按鈕停用並顯示處理中；按鈕旁有「送出後不可修改」提示；收到 `myTeamSubmission` 後顯示「本組已送出」並停用作答區（Q-T19 的送出部分）
- [X] T040 [P] [US1] 在 `frontend/tests/useServerCountdown.test.ts` 以 fake timers 測試：裝置時鐘快 30 秒時，剩餘時間仍以 `serverNow` 校正；歸零後回傳「時間到」狀態（Q-T18）

### Implementation for User Story 1

- [X] T041 [US1] 在 `backend/src/domain/submissionService.ts` 實作**同步**的 `submit(student, questionId, rawAnswer)`：依 contracts/rest-api.md「送出時的判定順序」檢查，使用 `shared` 的 `validateAnswer`，寫入記憶體 `Map<teamId, Submission>`，檢查 `data-model.md` Submission.question_id，並指派 `data-model.md` Submission.rank 與 Submission.received_at（伺服器時間），Submission.team_id 由伺服器決定；題目開放時清空 Map
- [X] T042 [US1] 在 `backend/src/domain/visibilityFilter.ts` 實作 `buildView(activity, teamId, submissions, results)`，依 `data-model.md` StudentView 每個欄位的「出現時機」組出資料，並附上 `serverNow`
- [X] T043 [US1] 在 `backend/src/http/routes/student.ts` 實作 `GET /api/student/state` 與 `POST /api/student/submissions`（以 zod 驗證 body：questionId 1–64 字、answer 為字串）；送出成功後呼叫 `pushToTeam(teamId, buildView(...))`
- [X] T044 [US1] 在 `backend/src/realtime/socketServer.ts` 補上連線成功時立即對該 socket 送出 `state:update`（目前的 StudentView）
- [X] T045 [P] [US1] 在 `frontend/src/hooks/useServerCountdown.ts` 實作：以 `endsAt` 與 `clockOffset` 每 250ms 計算剩餘秒數
- [X] T046 [P] [US1] 在 `frontend/src/components/WaitingView.tsx` 顯示「等待老師開放題目」
- [X] T047 [P] [US1] 在 `frontend/src/components/CountdownTimer.tsx` 顯示剩餘時間（mm:ss，最後 10 秒以撞色強調）；歸零後顯示「時間到，等待結果」
- [X] T048 [P] [US1] 在 `frontend/src/components/AnswerInput.tsx` 實作多行輸入、`n / 500` 字數計數（使用 `shared` 的 `validateAnswer`）、「送出後不可修改」提示、送出按鈕（高度至少 44px、撞色；處理中或斷線時停用，FR-014a）、顯示伺服器回傳的錯誤 message 與 hint
- [X] T049 [US1] 在 `frontend/src/components/AnsweringView.tsx` 組合題號、題目、CountdownTimer、AnswerInput；本組已送出時顯示「本組已送出」與送出的答案內容，並停用輸入
- [X] T050 [US1] 在 `frontend/src/pages/StudentPage.tsx` 接上 WaitingView 與 AnsweringView，並在 `question.questionId` 改變或進入 WAITING 時清除草稿

**Checkpoint**: US1 可以獨立運作——T034–T040 全部通過，quickstart §5 步驟 1–4 符合預期

---

## Phase 4: User Story 2 - 搶答結束後揭曉結果 (Priority: P1)

**Goal**: 時間到或手動結束後，所有學生依順位看到各組的組名與答案，以及本組成功／未成功／未送出；同時產生並保存題目結果

**Independent Test**: B、A、C 依序送出 → 手動結束 → 每位學生都看到順位 1/2/3，只有 B 顯示成功；`GET /api/dev/results` 有一筆完整結果（quickstart §5 步驟 6）

### Tests for User Story 2 ⚠️

- [X] T051 [P] [US2] 在 `backend/tests/unit/resultService.test.ts` 測試：rank 1 的資料成為結果；沒有人送出時 answer、winner_team、submitted_at 為 null；送出紀錄與結果在同一個交易寫入（模擬寫入失敗時兩者都沒有寫入）
- [X] T052 [P] [US2] 在 `backend/tests/integration/reveal.test.ts` 測試：B、A、C 依序送出後手動結束，三組都收到 CLOSED view，`results` 依 rank 排序，`myTeamOutcome` 分別為 WIN、LOSE、LOSE，未送出的組為 NOT_SUBMITTED；`results` 中不含送出時間與送出者；`/api/dev/results` 與 `/api/dev/submissions` 的內容正確（Q-T2、Q-T3）
- [X] T053 [P] [US2] 在 `frontend/tests/ResultView.test.tsx` 測試：依順位列出各組並標示成功的組；本組標示 WIN、LOSE、NOT_SUBMITTED 三種情況；沒有任何組送出時顯示「本題無組別送出答案」；答案含 `<script>` 時以純文字顯示（Q-T17 的 CLOSED 部分、Q-T20）

### Implementation for User Story 2

- [X] T054 [US2] 在 `backend/src/domain/resultService.ts` 實作 `finalize(activityId, questionId, submissions, reason)`：以 better-sqlite3 transaction 一次寫入 `submissions` 與 `question_results`（`data-model.md` QuestionResult.question_id、QuestionResult.answer、QuestionResult.winner_team、QuestionResult.submitted_at、QuestionResult.closed_reason）
- [X] T055 [US2] 在 `backend/src/domain/activityStateMachine.ts` 讓 `closeQuestion` 在轉換到 CLOSED 時呼叫 `resultService.finalize`，之後才觸發 `onChange` 推播
- [X] T056 [US2] 在 `backend/src/domain/visibilityFilter.ts` 補上 CLOSED 時的 `results`（`data-model.md` TeamAnswer，不含時間與送出者）與 `myTeamOutcome`（`data-model.md` StudentView.myTeamOutcome）
- [X] T057 [US2] 在 `backend/src/http/routes/devTeacher.ts` 加入 `GET /api/dev/results`（submitted_at 輸出為 ISO 8601）與 `GET /api/dev/submissions?questionId=`（以 zod 驗證 query）
- [X] T058 [P] [US2] 在 `frontend/src/components/ResultView.tsx` 實作結果列表（順位、組名、答案；成功的組使用撞色標記）、本組結果橫幅（本組搶答成功／本組未成功／本組未送出，搶答未成功）與「本題無組別送出答案」的空狀態
- [X] T059 [US2] 在 `frontend/src/pages/StudentPage.tsx` 接上 ResultView

**Checkpoint**: US1 與 US2 都可以獨立運作

---

## Phase 5: User Story 3 - 結束後送出被拒與清楚訊息 (Priority: P1)

**Goal**: 結束後（或在結束的瞬間）抵達的送出，一律以伺服器狀態為準拒絕，並顯示清楚原因；畫面隨後切換到結果

**Independent Test**: 開放 → 執行 time-up → 送出答案 → 收到 409 `QUESTION_CLOSED` 與正確訊息，結果資料不受影響（quickstart §5 步驟 7）

### Tests for User Story 3 ⚠️

- [X] T060 [P] [US3] 在 `backend/tests/integration/lateSubmit.test.ts` 測試：time-up 後送出回 409 `QUESTION_CLOSED`；manual close 後送出回 409；WAITING 時送出回 409 `QUESTION_NOT_OPEN`；結果紀錄的筆數不變（Q-T7）
- [X] T061 [P] [US3] 在 `frontend/tests/lateSubmit.test.tsx` 測試：送出時 API 回 `QUESTION_CLOSED`，畫面顯示 message「本題搶答已結束，無法再送出答案」，按鈕維持停用；收到 CLOSED view 後切換到 ResultView

### Implementation for User Story 3

- [X] T062 [US3] 在 `backend/src/domain/submissionService.ts` 補上判定：活動處於 CLOSED 且 questionId 等於剛結束的題目時，回 `QUESTION_CLOSED`；其他非 ANSWERING 的情況回 `QUESTION_NOT_OPEN`（順序依 contracts/rest-api.md）
- [X] T063 [US3] 在 `frontend/src/components/AnswerInput.tsx` 依錯誤碼決定按鈕狀態：`EMPTY_ANSWER`、`ANSWER_TOO_LONG` 時恢復可送出；`ALREADY_SUBMITTED`、`QUESTION_CLOSED`、`QUESTION_NOT_OPEN`、`ACTIVITY_ENDED` 時維持停用，並在畫面上顯示錯誤訊息

**Checkpoint**: P1 的三個 story 全部完成——MVP 可以展示

---

## Phase 6: User Story 6 - 開發與測試用 mock 與模擬老師操作 (Priority: P2)

**Goal**: 不需要老師端功能，就能從瀏覽器操作完整流程，非法操作也會顯示清楚原因

**Independent Test**: 只開啟 `/dev`，依序執行開放、時間到、手動結束、下一題、結束活動，學生畫面依活動階段表切換；非法操作被拒且階段不變（quickstart §4 Q-T16）

### Tests for User Story 6 ⚠️

- [X] T064 [P] [US6] 在 `backend/tests/integration/devTeacher.test.ts` 測試：作答中再開放回 409 `INVALID_TRANSITION`；秒數為 0、601、"abc" 回 400 `INVALID_SECONDS`；不存在的題目回 404；已經有結果的題目回 409 `QUESTION_ALREADY_CLOSED`；被拒後階段不變；`seconds` 省略時預設為 60（Q-T16）
- [X] T065 [P] [US6] 在 `frontend/tests/DevTeacherPanel.test.tsx` 測試：按鈕呼叫對應的 API；錯誤時顯示 message 與 hint；顯示目前的階段與題目

### Implementation for User Story 6

- [X] T066 [US6] 在 `frontend/src/pages/DevTeacherPanel.tsx` 實作模擬老師面板：題目下拉選單、秒數輸入（預設 60，前端提示範圍 5–600）、開放、時間到、手動結束、下一題、結束活動、重設等按鈕，並顯示目前的 phase、題目、endsAt 與錯誤訊息；只在 `import.meta.env.DEV` 時顯示
- [X] T067 [US6] 在 `frontend/src/pages/DevLoginPage.tsx` 加上 mock 學生清單的組別欄位（顯示未分組），並與 DevTeacherPanel 並排顯示（手機寬度時上下排列）

**Checkpoint**: 可以完全在瀏覽器中驗證所有學生端流程

---

## Phase 7: User Story 4 - 重新整理或斷線後回到正確畫面 (Priority: P2)

**Goal**: 重新整理、重連、晚加入、伺服器重啟後，自動回到正確的階段畫面

**Independent Test**: 作答中（本組已送出／未送出各一）以及已結束時分別重新整理、斷線再連線；作答中重啟伺服器時回到等待畫面（quickstart §5 步驟 5、8）

### Tests for User Story 4 ⚠️

- [X] T068 [P] [US4] 在 `backend/tests/integration/reconnect.test.ts` 測試：作答中本組已送出後斷開 socket 再重連，收到的 `state:update` 含 ANSWERING、`myTeamSubmission` 且不含他組資料；斷線期間題目已結束，重連後收到 CLOSED 與完整結果；作答中晚加入的學生可以正常送出（Q-T15）
- [X] T069 [P] [US4] 在 `backend/tests/integration/restart.test.ts` 測試：使用同一個暫存 SQLite 檔，Q1 結束後開放 Q2 並送出，接著關閉伺服器再重新啟動；活動回到 WAITING、Q2 沒有任何送出或結果、Q1 的結果與送出紀錄完整、Q2 可以重新開放（Q-T14）
- [X] T070 [P] [US4] 在 `frontend/tests/connection.test.tsx` 測試：觸發 disconnect 時顯示「連線中斷，正在重新連線，請稍後再送出」並停用送出按鈕；reconnect 並收到新的 view 後恢復；送出因網路錯誤失敗時不會顯示為已送出（Q-T19 的斷線部分）

### Implementation for User Story 4

- [X] T071 [US4] 在 `backend/src/server.ts` 實作啟動恢復：資料庫中的 `data-model.md` Activity.phase 為 ANSWERING 時，改設為 WAITING 並清空 Activity.current_question_id 與 Activity.ends_at，然後寫回資料庫（FR-020a）；只有在題目進入 CLOSED 時才寫入送出紀錄
- [X] T072 [US4] 在 `backend/src/domain/activityStateMachine.ts` 讓每次轉換都把 Activity 的 phase、current_question_id、ends_at 寫入資料庫，使已結束與等待中的狀態在重啟後可以恢復
- [X] T073 [P] [US4] 在 `frontend/src/components/ConnectionBanner.tsx` 實作斷線與重連中的提示橫幅（撞色、固定在頂部、不遮住送出按鈕）
- [X] T074 [US4] 在 `frontend/src/hooks/useStudentState.ts` 處理 `connect`／`disconnect`：斷線時標記離線；重連後以 `state:update` 取代整份狀態，並再呼叫一次 `GET /api/student/state` 作為保險；在 `frontend/src/pages/StudentPage.tsx` 掛上 ConnectionBanner，離線時停用送出

**Checkpoint**: 重新整理、斷線、伺服器重啟都可以正確恢復

---

## Phase 8: User Story 5 - 活動結束提示 (Priority: P3)

**Goal**: 老師結束活動後，所有學生顯示「活動已結束，感謝參與」，送出被拒

**Independent Test**: dev 執行 end → 所有學生畫面切換，重新整理後仍是同一畫面，送出回 409 `ACTIVITY_ENDED`（quickstart §5 步驟 9）

### Tests for User Story 5 ⚠️

- [X] T075 [P] [US5] 在 `backend/tests/integration/activityEnd.test.ts` 測試：WAITING、ANSWERING、CLOSED 三種階段執行 end 都會推播 ENDED；在 ANSWERING 時執行 end 會先產生該題結果（closed_reason 為 `ACTIVITY_ENDED`）；結束後送出回 409 `ACTIVITY_ENDED`；`GET /state` 回 ENDED；ENDED 之後再執行 end 回 409
- [X] T076 [P] [US5] 在 `frontend/tests/ActivityEndedView.test.tsx` 測試：phase 為 ENDED 時顯示「活動已結束，感謝參與」，而且沒有作答區

### Implementation for User Story 5

- [X] T077 [US5] 在 `backend/src/domain/activityStateMachine.ts` 確認 `endActivity` 在 ANSWERING 時先執行 `closeQuestion('ACTIVITY_ENDED')`；在 `backend/src/domain/submissionService.ts` 於 ENDED 時優先回 `ACTIVITY_ENDED`
- [X] T078 [P] [US5] 在 `frontend/src/components/ActivityEndedView.tsx` 實作活動結束畫面，並在 `frontend/src/pages/StudentPage.tsx` 接上

**Checkpoint**: 所有 user story 都可以獨立運作

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 跨 story 的驗收、RWD、文件與憲章品質關卡

- [X] T079 [P] 在 `frontend/tests/StudentPage.test.tsx` 補上四種 phase 依序切換的測試，並確認從 CLOSED 回到 WAITING 再開放下一題時，不會帶到上一題的已送出狀態與草稿（Q-T17、spec Edge Cases「連續多題」）
- [X] T080 [P] 在 `backend/tests/integration/sync.test.ts` 測試：10 個 socket 在階段變化後 1 秒內都收到 `state:update`；不同 socket 收到的 `endsAt` 相同（SC-001、SC-002）
- [X] T081 檢查 `frontend/src/styles/global.css` 與各元件，確保在 375px 與 1440px 寬度下沒有水平捲動、所有按鈕高度至少 44px、色票只透過 tokens 使用（FR-025、FR-026、SC-009）
- [X] T082 [P] 檢查並補強 log：`backend/src/http/middleware/errorHandler.ts` 與 `backend/src/realtime/socketServer.ts` 只記錄錯誤碼、路徑與 studentId，不記錄 token、`SESSION_SECRET` 或 `.env` 的值（憲章「安全與資料處理要求」）
- [X] T083 [P] 撰寫根目錄 `README.md`：安裝 Node 22、設定 `.env`、`npm run dev`、`npm test`、dev 頁面使用方式，並連結 quickstart.md
- [X] T084 若實作與設計有出入，同步更新 `diagrams/student-component.puml`、`diagrams/student-class.puml`、`diagrams/student-sequence.puml` 並重新產生 PNG
- [X] T085 依 quickstart.md §5 完成 10 步手動驗收，並執行 `npm test`，依憲章原則 V 回報實際指令與通過／失敗數量
- [X] T086 合併前的品質關卡：檢查 `git diff` 中沒有機敏資料，確認輸入驗證、錯誤訊息、測試與回報四項都通過（constitution「開發流程與品質關卡」）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：沒有相依，可以立即開始
- **Foundational (Phase 2)**：依賴 Setup——會阻擋所有 user story
- **US1 (Phase 3)**：依賴 Foundational
- **US2 (Phase 4)**：依賴 Foundational；需要 US1 的 `submissionService` 才能產生送出資料（T054 讀取 T041 的 Map）
- **US3 (Phase 5)**：依賴 US1（擴充 `submissionService` 的判定）
- **US6 (Phase 6)**：依賴 Foundational（後端 dev API 已在 T022 完成）；T064 中 `QUESTION_ALREADY_CLOSED` 的案例依賴 US2 的 T054
- **US4 (Phase 7)**：依賴 US1；T069 依賴 US2 的結果持久化
- **US5 (Phase 8)**：依賴 Foundational；T075 中「ANSWERING 時結束會產生結果」依賴 US2
- **Polish (Phase 9)**：依賴所有 story

### User Story Dependencies

```text
Setup → Foundational ─┬─ US1 ─┬─ US2 ─┬─ US4
                      │       └─ US3  ├─ US5
                      └─ US6 ─────────┘
```

### Within Each User Story

- 測試要先寫，並確認在實作前會失敗
- 先 domain（service、filter），再 routes／socket，再前端元件，最後接到頁面
- 一個 story 完成並通過它的測試後，才進入下一個

### Parallel Opportunities

- Setup：T002–T006 可以平行
- Foundational：T008–T011（shared）、T013、T019、T026、T027、T028–T030 可以平行；後端主線 T012 → T014 → T015 → T016 → T018 → T020–T025 依序進行
- 每個 story 的測試任務（標 [P]）可以同時撰寫
- US1 的前端元件 T045–T048 與後端 T041–T044 可以由兩個人平行進行
- Foundational 完成後，US6 的前端（T066、T067）可以與 US1 平行進行

---

## Parallel Example: User Story 1

```text
# 同時撰寫 US1 的所有測試：
Task: "submissionService 單元測試 in backend/tests/unit/submissionService.test.ts"
Task: "visibilityFilter 單元測試 in backend/tests/unit/visibilityFilter.test.ts"
Task: "送出整合測試 in backend/tests/integration/submit.test.ts"
Task: "隔離整合測試 in backend/tests/integration/isolation.test.ts"
Task: "AnsweringView 元件測試 in frontend/tests/AnsweringView.test.tsx"

# 同時實作 US1 的前端元件：
Task: "useServerCountdown in frontend/src/hooks/useServerCountdown.ts"
Task: "WaitingView in frontend/src/components/WaitingView.tsx"
Task: "CountdownTimer in frontend/src/components/CountdownTimer.tsx"
Task: "AnswerInput in frontend/src/components/AnswerInput.tsx"
```

---

## Implementation Strategy

### MVP First（US1 + US2 + US3，皆為 P1）

1. 完成 Phase 1 Setup 與 Phase 2 Foundational
2. 完成 US1 → **停下來驗證**：送出、同組同步、他組隔離
3. 完成 US2 → 驗證揭曉與結果資料
4. 完成 US3 → 驗證結束後送出被拒
5. 這時已是可以展示的最小搶答流程（roadmap M3 的學生端）

### Incremental Delivery

1. Setup + Foundational → 伺服器可以啟動、可以 dev 登入
2. + US1 → 可以搶答（第一次展示）
3. + US2 + US3 → 完整單題流程（MVP）
4. + US6 → 瀏覽器內的模擬老師面板
5. + US4 → 斷線與重啟可以恢復
6. + US5 → 活動結束畫面
7. Polish → RWD、同步效能、品質關卡

### Parallel Team Strategy

1. 全組一起完成 Setup 與 Foundational
2. 之後分工：
   - 開發者 A：後端 US1 → US2 → US3
   - 開發者 B：前端 US1 → US2 元件
   - 開發者 C：US6 面板 → US4 前端連線處理

---

## Notes

- [P] 表示不同檔案且沒有相依；[USn] 對應 spec.md 的 user story
- 欄位限制以 `data-model.md` 為準，任務只引用、不重複抄寫
- 每個任務或邏輯群組完成後就 commit；每個 checkpoint 都可以停下來獨立驗證
- 完成時依憲章原則 V，回報 `npm test` 的實際結果

---

## Phase 10: Convergence

- [X] T087 將 `frontend/src/realtime/socket.ts` 的重連等待上限由 5000ms 降到 2000ms 以內，並在收到 `window` 的 `online` 事件時立即呼叫 `connect()`；在 `backend/tests/integration/reconnect.test.ts` 加入「伺服器中斷約 1 秒後恢復，到收到正確 `state:update` ≤ 3 秒」的測試，並同步更新 `contracts/socket-events.md` 的重連行為說明 per SC-006 (partial)
- [X] T088 讓 `backend/src/http/errors.ts` 的 `parseOrThrow` 一律輸出中文訊息：body 不是 JSON 物件時回「請求內容必須是 JSON 物件」（field `body`）；欄位型別錯誤時依欄位說明正確型別（例如 questionId 傳陣列時不得誤報「必填」）；不得把 zod 預設的英文技術訊息回傳給使用者。在 `backend/tests/integration/submit.test.ts` 與 `backend/tests/integration/devTeacher.test.ts` 加入 body 為陣列、欄位型別錯誤的測試 per Constitution II (partial)
- [X] T089 讓 `data-model.md` 的狀態轉換表與已實作的行為一致：ENDED 時除 dev `reset()` 外一律回 `ACTIVITY_ENDED`（目前表格寫 `open`、`nextQuestion`、`timeUp`／`manualClose` 回 `INVALID_TRANSITION`），並加入 `reset()`（僅 dev，可從任何階段含 ENDED 回到 WAITING、清除結果）一列 per plan: data-model 狀態轉換 (contradicts)
- [X] T090 檢視 `backend/src/http/routes/devTeacher.ts` 的 `GET /api/dev/teacher/status` 與 `shared/src/errorCodes.ts` 的 `NOT_FOUND` 錯誤碼：保留則補進 `contracts/rest-api.md`（含回應格式與錯誤碼表），並移除合約中從未產生的 `DEV_TOOLS_DISABLED` 列 per contracts/rest-api.md (unrequested)
