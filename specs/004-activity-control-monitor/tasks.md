---

description: "Task list for F5/F8 activity control and teacher monitor"
---

# Tasks: 活動管理與逐題開放控制＋老師即時監控看板（F5＋F8）

**Input**: Design documents from `/specs/004-activity-control-monitor/`

**Prerequisites**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、[data-model.md](data-model.md)、[contracts/](contracts/)、[quickstart.md](quickstart.md)

**Tests**: 憲章原則 IV 要求每個功能具備正常與邊界案例測試，因此每個 user story 都包含測試任務，且須先寫測試、確認失敗後再實作。

**Organization**: 依 user story 分組，每個 story 可獨立實作與驗證。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔案、不依賴未完成任務）
- **[Story]**: 對應 spec.md 的 user story（US1～US6）
- 欄位限制一律引用 `data-model.md` 的 `表.欄位`（例如 `data-model.md §1.2 questions.seconds`），不重抄規則

## Path Conventions

Web app：`shared/src/`、`backend/src/`、`backend/tests/`、`frontend/src/`、`frontend/tests/`（見 plan.md「Source Code」）。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立本功能的共用檔案骨架與測試 helper

- [X] T001 建立 `shared/src/activity.ts`（空的 `ActivityRules` 物件與 data-model.md §3 的 DTO 型別宣告：`StudentPhase`、`TeacherPhase`、`ActivityQuestionStatus`、`ClosedReason`、`PartAnswer`、`QuestionListItem`、`ActivityQuestionDetail`、`MonitorTeamRow`、`MonitorView`、`ResultBoardView`、`TeacherActivityView`，`QuestionKind` 自 `annotation.ts` 重新匯出），並在 `shared/src/index.ts` 匯出
- [X] T002 [P] 在 `shared/src/errorCodes.ts` 新增 research.md R12 的 11 個錯誤碼（`NO_ACTIVITY`、`ACTIVITY_ALREADY_RUNNING`、`NO_QUESTION_SET`、`NO_TEAM_MEMBERS`、`QUESTION_NOT_CLOSED`、`REOPEN_NOT_CONFIRMED`、`QUESTION_SET_LOCKED`、`GROUP_CHANGE_LOCKED`、`PART_ANSWER_EMPTY`、`PART_ANSWER_TOO_LONG`、`PART_COUNT_MISMATCH`），訊息與 hint 依 contracts/openapi.yaml `ErrorResponse`；修改 `INVALID_SECONDS` 為「作答秒數須為 5～600 的整數」、`QUESTION_ALREADY_CLOSED` 提示改用「重新開放」
- [X] T003 [P] 建立測試 helper `backend/tests/helpers/activity.ts`：建立老師與學生 session、指派組別、以 FakeGoogle 或直接寫入 repository 建立題目集（單題＋題組）、建立 mock 活動、連線 `/student` 與 `/teacher` socket 並收集事件

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 資料表、型別、狀態機、推播通道與組裝——所有 story 都依賴

**⚠️ CRITICAL**: 本階段完成前不得開始任何 user story

### 測試（先寫、先失敗）

- [X] T004 [P] 在 `shared/tests/activity.test.ts` 撰寫 `validateSeconds`（4、5、60、600、601、0、-1、60.5、"60"、""、" "、undefined → 預設 60）與 `validatePartAnswers`（長度不符、第 2 小題空白、只有空白、500／501 字、emoji 計 1 字、錯誤 `field` 為 `answers[i]` 且訊息含小題標籤）測試，規則依 data-model.md §4 的 `seconds`、`answers`、`answers[i]`
- [X] T005 [P] 在 `backend/tests/unit/migrations.test.ts` 新增 v4 測試：既有 v2 資料（含 `A1` 活動與送出）升級後 `submissions.round = 1`、`voided = 0`、`A1` 變為 `ENDED`；部分唯一索引阻擋同題第二筆 `voided = 0` 結果（data-model.md §1.7 question_results.voided）
- [X] T006 [P] 在 `backend/tests/unit/activityStateMachine.test.ts` 補上：無活動（state 為 null）時各操作回 `NO_ACTIVITY`、`start(activity)` 進入 WAITING、`backToWaiting()`（原 `next()`）只在 CLOSED 可用且 WAITING 時無變化、`recoverAfterRestart()` 回傳通知文字

### 實作

- [X] T007 實作 `shared/src/activity.ts` 的 `validateSeconds` 與 `validatePartAnswers`（沿用 `answerRules.ts` 的 `validateAnswer`、`countChars`），依 data-model.md §4 的 `seconds`、`answers`、`answers[i]` 規則與 data-model.md §1.6 submission_parts.answer
- [X] T008 在 `backend/src/db/migrations.ts` 新增 version 4：保留 data-model.md §1.1 activities.phase 的既有 CHECK（重建或改表時不得放寬）、擴充 `activities`（data-model.md §1.1 activities.opened_at、activities.started_at、activities.started_by、activities.ended_at、activities.source_title、activities.notice）、擴充 `questions`（data-model.md §1.2 questions.label、questions.kind、questions.stem、questions.question_key、questions.status、questions.current_round、questions.seconds、questions.opened_at、questions.closed_at、questions.closed_reason，含舊資料 status 回填）、建立 `question_parts`（data-model.md §1.3 question_parts.part_index、question_parts.question_text）、`question_participants`（data-model.md §1.4 question_participants.member_count）、重建 `submissions`（data-model.md §1.5 submissions.round、submissions.voided）、建立 `submission_parts`（data-model.md §1.6）、重建 `question_results`（data-model.md §1.7 question_results.round、question_results.voided 與部分唯一索引）、建立 `result_parts`（data-model.md §1.8）、`activity_events`（data-model.md §1.9 activity_events.type、activity_events.detail），並把未結束的 `A1` 標為 `ENDED`
- [X] T009 [P] 擴充 `backend/src/domain/buzzerTypes.ts`：`Activity`（可空欄位 openedAt、startedAt、startedBy、endedAt、sourceTitle、notice）、`Question`→加入 `ActivityQuestion` 欄位、`QuestionPart`、`ParticipatingTeam`、`PartAnswer`、`Submission.answers/round/voided`、`QuestionResult.round/voided/answers`、`ActivityEvent`、`ActivityEventType`，名稱與 `diagrams/004-class.puml` 一致
- [X] T010 擴充 `backend/src/data/repositories.ts`：讀寫新欄位；`createActivity(activity, questions, parts)` 交易；`listActivityQuestions`、`getQuestionParts`、`updateQuestionState`、`saveParticipants`、`listParticipants`；`saveQuestionOutcome` 改為「作廢同題較早輪次（data-model.md §1.5 submissions.voided、§1.7 question_results.voided）＋寫入本輪 submissions／submission_parts／question_results／result_parts」單一交易；所有結果與送出查詢加上 `voided = 0`；`saveActivity` 寫入擴充欄位（依 T008）
- [X] T011 [P] 建立 `backend/src/db/activityEventRepository.ts`（`append(event)`、`listByActivity(activityId)`），`detail` 不得含答案內容（data-model.md §1.9 activity_events.detail）
- [X] T012 改寫 `backend/src/domain/activityStateMachine.ts`：state 可為 null、新增 `start(activity)`、`open()` 允許 WAITING 或 CLOSED 起始並遞增 `current_round`（data-model.md §1.2 questions.current_round、questions.status）、`next()` 改名 `backToWaiting()`、`recoverAfterRestart()` 依 research.md R5 還原題目狀態並回傳通知文字；公開方法與 `diagrams/004-class.puml` 的 `ActivityStateMachine` 完全一致（依 T009、T010）
- [X] T013 擴充 `backend/src/domain/submissionService.ts`：`startQuestion(questionId, round, partCount)`、`submit(student, questionId, answers)` 使用 `validatePartAnswers`，`Submission.answer` 為合併顯示文字（research.md R6）（依 T007、T012）
- [X] T014 擴充 `backend/src/domain/resultService.ts`：`finalize(activityId, questionId, round, submissions, reason)` 呼叫 T010 的交易並產生含 `answers` 的 `QuestionResult`（依 T010）
- [X] T015 [P] 建立 `backend/src/services/activityLockGuard.ts`：`bind(phaseReader)`、`assertQuestionSetMutable()`、`assertGroupChangeAllowed()`（research.md R8），未綁定時一律放行
- [X] T016 在 `backend/src/http/middleware/auth.ts` 新增 `authenticateTeacherCookie`；在 `backend/src/realtime/socketServer.ts` 新增 `/teacher` namespace（只限老師，連線即送 `teacher:update`）、`pushTeachers()`，並設定 `pingInterval: 4000`、`pingTimeout: 5000`（contracts/socket-events.md）；`backend/src/context.ts` 的 `Realtime` 介面加入 `pushTeachers`
- [X] T017 建立 `backend/src/services/monitorViewBuilder.ts` 的 `build(now)` 基本版：產生 `TeacherActivityView` 的 `phase`（無活動為 `NONE`）、`serverNow`、`activity`、`readiness`、`questions`、`progress`、`current`、`endsAt`、`notice`（`monitor`、`result`、`preselectedQuestionId` 先回 null，於 US2～US4 補齊）
- [X] T018 建立 `backend/src/services/activityService.ts` 骨架（`getView()` 委派 `MonitorViewBuilder.build`）、`backend/src/schemas/activity.ts`（openBody、reopenBody、questionIdParams，依 contracts/openapi.yaml；欄位規則引用 data-model.md §4 `questionId`、data-model.md §4 `confirm`（reopen）、data-model.md §4 `seconds`），以及 `backend/src/routes/activityRoutes.ts` 的 `GET /api/teacher/activity`（requireAuth＋requireRole TEACHER）
- [X] T019 組裝：`backend/src/app.ts` 的 `createContainer` 建立 `ActivityLockGuard` 並注入 `GroupService`、`QuestionSetService`、`QuestionImportService`（先只傳入，不呼叫），掛載 `/teacher/activity`；`backend/src/server.ts` 移除自動 `seedMockData`、建立狀態機後 `lockGuard.bind()`、hooks 接上新簽章、`onChange` 同時 `pushAll()` 與 `pushTeachers()`、重啟通知寫入 `activities.notice` 與 `RESTART_CANCELLED` 事件（依 T010～T018）
- [X] T020 更新 `backend/src/domain/visibilityFilter.ts` 與 `shared/src/types.ts`：`StudentView.phase` 加入 `NO_ACTIVITY`、`question` 加入 `kind`／`stem`／`parts`、`myTeamSubmission.answers`、`results[].answers`；確認輸出仍不含任何監控欄位（data-model.md §3）
- [X] T021 更新 002 的 dev 路由 `backend/src/http/routes/devTeacher.ts`：`/next` 改為 `/back-to-waiting`、新增 `POST /mock-activity`（呼叫 `backend/src/data/mock/seed.ts` 以 mock 題目開始活動）；更新既有 002 整合測試（`backend/tests/integration/*.test.ts` 中的 buzzer 類測試）改用 T003 helper 建立活動
- [X] T022 [P] 前端基礎：`frontend/src/api/apiClient.ts` 新增 teacherActivity 方法（get、start、open、reopen、close、backToWaiting、end、getResult）；`frontend/src/realtime/socket.ts` 新增 `connectTeacher()`；建立 `frontend/src/activity/useTeacherActivity.ts`（REST＋`teacher:update` 合併，以較新 `serverNow` 為準）
- [X] T023 [P] 前端頁面骨架：`frontend/src/pages/ActivityControlPage.tsx`（依 phase 切換主要區的空殼、狀態列、連線狀態）、`frontend/src/main.tsx` 新增 `/teacher/activity` 路由、`frontend/src/pages/TeacherDashboard.tsx` 新增「搶答活動」按鈕

**Checkpoint**: `npm test` 全綠（含修改後的 002／003 測試），老師可開啟空的活動頁

---

## Phase 3: User Story 1 - 開始一場搶答活動 (Priority: P1) 🎯 MVP

**Goal**: 以題目集與組別開始活動、學生畫面切換、活動中鎖定題目集

**Independent Test**: 匯入 6 題題目集、3 組有成員後按「開始活動」，題目清單 6 題皆未開放，學生 1 秒內看到等待畫面；清除題目集被拒（spec US1）

### Tests for User Story 1

- [X] T024 [P] [US1] 在 `backend/tests/integration/activity.start.test.ts` 撰寫：正常開始（題目、小題、順序複製正確，data-model.md §1.2 questions.label、questions.kind、§1.3 question_parts.question_text）、無題目集 409 `NO_QUESTION_SET`、無有成員組別 409 `NO_TEAM_MEMBERS`、已有活動 409 `ACTIVITY_ALREADY_RUNNING`、開始後學生 socket 1 秒內收到 WAITING、之後題目集變動不影響本場題目（FR-002）
- [X] T025 [P] [US1] 在 `backend/tests/integration/activity.lock.test.ts` 撰寫：活動未結束時 `DELETE /api/question-set`、`POST /api/question-set/reimport`、`POST /api/question-import/drafts/{id}/confirm` 回 409 `QUESTION_SET_LOCKED` 且題目集不變；讀取學習單與標註仍可用；活動 `ENDED` 後解除
- [X] T026 [P] [US1] 在 `backend/tests/integration/activity.auth.test.ts` 撰寫：學生呼叫所有 `/api/teacher/activity/*` 回 403「權限不足」、未登入 401、學生 socket 連 `/teacher` 被拒、狀態不變（FR-027）
- [X] T027 [P] [US1] 在 `backend/tests/unit/activityLockGuard.test.ts` 撰寫：未綁定放行、各階段的題目集與組別鎖定矩陣
- [X] T028 [P] [US1] 在 `frontend/tests/ActivityControlPage.test.tsx` 撰寫 NONE 階段：顯示題目集來源、題數、組數與人數；缺題目集或組別時按鈕停用並顯示原因與連結；按下後呈現 WAITING 題目清單；在 `frontend/tests/StudentPage.test.tsx` 補 `NO_ACTIVITY` 文案

### Implementation for User Story 1

- [X] T029 [US1] 在 `backend/src/services/activityService.ts` 實作 `startActivity(teacherId)`：檢查無未結束活動、題目集 ≥ 1 題、≥ 1 組有成員，產生 `ACT-…` id（data-model.md §1.1 activities.id），在 T010 的交易中複製題目與小題，呼叫 `machine.start()`，寫入 `STARTED` 事件（依 T019）
- [X] T030 [US1] 在 `backend/src/routes/activityRoutes.ts` 新增 `POST /start`；在 `backend/src/services/monitorViewBuilder.ts` 補齊 `readiness`（NONE／ENDED 時的題目集來源、題數、各組人數）
- [X] T031 [US1] 在 `backend/src/services/questionSetService.ts`（`clear`、`reimport`）與 `backend/src/services/questionImportService.ts`（`confirm`）呼叫 `assertQuestionSetMutable()`
- [X] T032 [P] [US1] 建立 `frontend/src/activity/ActivityStartPanel.tsx`（開始活動主按鈕、停用原因、前往題目管理／組別管理連結）並接入 `ActivityControlPage`
- [X] T033 [P] [US1] 建立 `frontend/src/activity/ActivityQuestionList.tsx` 基本版（題號、摘要、狀態徽章、進度「已完成 N／M 題」）並接入 `ActivityControlPage`
- [X] T034 [P] [US1] 更新 `frontend/src/components/WaitingView.tsx` 與 `frontend/src/hooks/useStudentState.ts` 支援 `NO_ACTIVITY`（「目前沒有進行中的活動，請等待老師開始」）

**Checkpoint**: US1 可獨立展示：開始活動、學生同步、題目集鎖定

---

## Phase 4: User Story 2 - 選題開放、時間到自動結束與手動結束 (Priority: P1)

**Goal**: 逐題開放（含題組多作答框）、伺服器計時、手動結束、直接開放下一題、回到等待、重新開放

**Independent Test**: 開放第 1 題 10 秒等自然結束；在結果畫面直接開放第 2 題 60 秒、5 秒後手動結束；兩題各一筆結果、原因分別為時間到與手動結束（spec US2）

### Tests for User Story 2

- [X] T035 [P] [US2] 在 `backend/tests/unit/activityStateMachine.test.ts` 補：CLOSED → open 下一題、作答中開放其他題 409、已結束題 open 回 `QUESTION_ALREADY_CLOSED`、reopen 遞增輪次、同題重複 open／reopen 為無變化、時間到與 `manualClose` 同時 100 次只產生 1 筆結果（fake timers）
- [X] T036 [P] [US2] 在 `backend/tests/integration/activity.open.test.ts` 撰寫：開放後老師與學生 1 秒內收到 ANSWERING 與相同 `endsAt`、秒數邊界（data-model.md §1.2 questions.seconds：4、601、0、-1、60.5、"60"、空白被拒；5、600 接受；省略為 60）、未知 questionId 404、從 CLOSED 直接開放下一題時學生畫面由結果切到新題、`back-to-waiting` 後學生回等待、參與組別記錄（data-model.md §1.4 question_participants.member_count）
- [X] T037 [P] [US2] 在 `backend/tests/integration/activity.close.test.ts` 撰寫：時間到自動結束（原因 TIME_UP）、手動結束（MANUAL）、題目已結束時 close 回 200 無變化、結果寫入 `data-model.md §1.2 questions.closed_reason`；時間到、手動結束、結束活動連帶結束三種情況各寫入一筆 `QUESTION_CLOSED` 事件（data-model.md §1.9 activity_events.type），時間到與連帶結束的 `actor_id` 為 NULL（data-model.md §1.9 activity_events.actor_id）
- [X] T038 [P] [US2] 在 `backend/tests/integration/activity.reopen.test.ts` 撰寫：未帶 `confirm: true` 回 409 `REOPEN_NOT_CONFIRMED`、非 CLOSED 題回 `QUESTION_NOT_CLOSED`、重開後各組可再送出、新一輪結束後舊輪 `voided = 1`（data-model.md §1.5 submissions.voided、§1.7 question_results.voided）且所有查詢只回新一輪（SC-011）、連點重開只產生一輪
- [X] T039 [P] [US2] 在 `backend/tests/integration/submit.parts.test.ts` 撰寫：題組 `answers[]` 正常送出、長度不符 `PART_COUNT_MISMATCH`、第（2）小題空白 `PART_ANSWER_EMPTY` 且 `field = answers[1]`、501 字 `PART_ANSWER_TOO_LONG`、單題仍接受舊 `answer` 格式、結束後 `submission_parts` 與 `result_parts` 正確（data-model.md §1.6 submission_parts.answer、§1.8）
- [X] T040 [P] [US2] 在 `frontend/tests/OpenQuestionForm.test.tsx` 撰寫：預設 60、即時驗證 5～600 整數、送出中停用、題組顯示共同題幹與小題、重新開放確認視窗文案；在 `frontend/tests/AnsweringView.test.tsx` 補題組多作答框、每框字數、空白小題提示

### Implementation for User Story 2

- [X] T041 [US2] 在 `backend/src/domain/activityStateMachine.ts` 實作 `reopen(questionId, seconds)`，並讓 `open`、`reopen`、`closeQuestion`、`backToWaiting`、`end` 依 research.md R11 的冪等表回應（依 T012）
- [X] T042 [US2] 在 `backend/src/services/activityService.ts` 實作 `openQuestion`、`reopenQuestion(…, confirm)`、`closeQuestion`、`backToWaiting`：以 `validateSeconds` 驗證、計算並寫入參與組別（research.md R7）、寫入 `QUESTION_OPENED`／`QUESTION_REOPENED`／`BACK_TO_WAITING` 事件（data-model.md §1.9 activity_events.type），操作後清除 `activities.notice`；`QUESTION_CLOSED` 事件改由 `ActivityService` 註冊於狀態機 `onQuestionClosed` hook 統一寫入（含 TIME_UP、MANUAL、ACTIVITY_ENDED，系統觸發時 data-model.md §1.9 activity_events.actor_id 為 NULL），避免只有手動結束才有紀錄（FR-029）
- [X] T043 [US2] 在 `backend/src/routes/activityRoutes.ts` 新增 `POST /open`、`/reopen`、`/close`、`/back-to-waiting`（使用 `backend/src/schemas/activity.ts`）
- [X] T044 [US2] 在 `backend/src/services/monitorViewBuilder.ts` 補 `preselectedQuestionId`（research.md R4）與 `current`（含小題）
- [X] T045 [US2] 更新 `backend/src/http/routes/student.ts` 的 `submitSchema` 接受 `answers[]` 或單題 `answer`（contracts/openapi.yaml `/student/submissions`），回應改含 `answers`
- [X] T046 [P] [US2] 建立 `frontend/src/activity/OpenQuestionForm.tsx`（題目內容、秒數欄位 `inputMode="numeric"`、開始搶答、重新開放確認視窗、回到等待畫面）並接入 `ActivityControlPage` 的 WAITING／CLOSED 區
- [X] T047 [P] [US2] 更新 `frontend/src/components/AnsweringView.tsx`、`frontend/src/components/AnswerInput.tsx`、`frontend/src/api/apiClient.ts`：題組顯示共同題幹與每小題一個作答框，一次送出 `answers[]`，錯誤定位到對應小題
- [X] T048 [US2] 在 `frontend/src/activity/ActivityQuestionList.tsx` 加入點選未開放題目設為開放目標的行為

**Checkpoint**: US1＋US2 可展示完整的逐題搶答流程（無監控細節）

---

## Phase 5: User Story 3 - 作答中即時監控各組送出 (Priority: P1)

**Goal**: 老師看板即時顯示各組送出狀態、順位、送出時間、送出者與答案，學生端完全隔離

**Independent Test**: B、A、C 依序送出、D 未送出，看板每次 1 秒內更新、B 標「目前最快」、計數 0/4→3/4（spec US3）

### Tests for User Story 3

- [X] T049 [P] [US3] 在 `backend/tests/unit/monitorViewBuilder.test.ts` 撰寫：已送出依 rank 排序、未送出依組號在後、`elapsedSeconds` 精確到 0.1、看板列與 `teamCount` 只含本輪參與組別（data-model.md §1.4 question_participants）、`allSubmitted`
- [X] T050 [P] [US3] 在 `backend/tests/integration/monitor.sync.test.ts` 撰寫：10 組同時送出時老師看板順位與伺服器接受順序一致且無重複（SC-003）、兩個老師連線 1 秒內收到一致的 `teacher:update`、重新整理（`GET /api/teacher/activity`）內容與推播相同
- [X] T051 [P] [US3] 在 `backend/tests/integration/monitor.isolation.test.ts` 撰寫：攔截所有學生端 `state:update` 與 `GET /api/student/state`，作答中 0 筆含他組資料、`elapsedSeconds`、`submitterName`、在線人數（SC-006）
- [X] T052 [P] [US3] 在 `frontend/tests/MonitorBoard.test.tsx` 撰寫：倒數、已送出計數、目前最快標籤、送出者與答案（題組依小題）、常駐投影提醒、全部送出提示、歸零後「時間到，結算中」、結束搶答確認視窗

### Implementation for User Story 3

- [X] T053 [US3] 在 `backend/src/services/monitorViewBuilder.ts` 實作 `monitor`（MonitorView、MonitorTeamRow；送出者姓名由 Repository 查學生、答案來自 `SubmissionService.all()`）
- [X] T054 [US3] 在 `backend/src/http/routes/student.ts` 送出被接受後呼叫 `ctx.realtime.pushTeachers()`（在 `pushToTeam` 之後，contracts/socket-events.md「推播順序」）
- [X] T055 [P] [US3] 建立 `frontend/src/activity/MonitorBoard.tsx`（沿用 `useServerCountdown`、答案以 `white-space: pre-wrap` 純文字顯示、長答案可收合）並接入 `ActivityControlPage` 的 ANSWERING 區，狀態列加入作答中投影提醒

**Checkpoint**: M3 Demo 的「老師即時看到送出順序」可展示

---

## Phase 6: User Story 4 - 已結束結果看板與本場題目回顧 (Priority: P1)

**Goal**: 結束後依順位顯示所有組答案與搶答成功組，並可回顧本場任一已結束題目

**Independent Test**: 第 1 題 B、A、C 送出後手動結束，看板順序與未送出組正確；進入第 2 題後點第 1 題仍可看到相同結果（spec US4）

### Tests for User Story 4

- [X] T056 [P] [US4] 在 `backend/tests/integration/activity.result.test.ts` 撰寫：CLOSED 時 `result` 依順位、rank 1 為搶答成功、未送出組列在後、無人送出 `noSubmission`、結束原因；`GET /api/teacher/activity/questions/{id}/result` 在其他階段可讀、未結束題回 `QUESTION_NOT_CLOSED`、重開後只回有效輪次；題目清單 `winnerTeamName` 與進度正確
- [X] T057 [P] [US4] 在 `frontend/tests/ResultBoard.test.tsx` 撰寫：順位、搶答成功標示、未送出、無人送出文案、題組依小題、HTML／換行以純文字顯示（FR-020）；在 `frontend/tests/ResultView.test.tsx` 補學生端依小題分列

### Implementation for User Story 4

- [X] T058 [US4] 在 `backend/src/services/monitorViewBuilder.ts` 實作 `buildResult(questionId)`（讀取 `voided = 0` 的送出與結果，data-model.md §1.7 question_results.voided）並填入 CLOSED 時的 `result` 與題目清單的 `winnerTeamName`
- [X] T059 [US4] 在 `backend/src/services/activityService.ts` 實作 `getQuestionResult(questionId)`，在 `backend/src/routes/activityRoutes.ts` 新增 `GET /questions/:questionId/result`
- [X] T060 [P] [US4] 建立 `frontend/src/activity/ResultBoard.tsx` 並接入 `ActivityControlPage` 的 CLOSED 區（上方結果、下方 OpenQuestionForm 預選下一題）
- [X] T061 [P] [US4] 在 `frontend/src/activity/ActivityQuestionList.tsx` 加入點選已結束題目以對話框顯示唯讀 `ResultBoard`（含「重新開放」入口）
- [X] T062 [P] [US4] 更新 `frontend/src/components/ResultView.tsx`：學生結果依小題分列（仍不顯示送出時間與送出者）

**Checkpoint**: US1～US4 構成完整 MVP（M3 Demo 情境）

---

## Phase 7: User Story 5 - 結束整場活動與狀態恢復 (Priority: P2)

**Goal**: 結束活動、摘要、開始新活動；重新整理、斷線、重啟後回到正確狀態

**Independent Test**: 作答中重新整理老師頁 3 秒內恢復；結束活動確認提示未開放題數，學生顯示活動結束，題目管理可再匯入（spec US5）

### Tests for User Story 5

- [X] T063 [P] [US5] 在 `backend/tests/integration/activity.end.test.ts` 撰寫：WAITING／CLOSED 結束、作答中結束先產生結果（原因 ACTIVITY_ENDED）、已結束再結束為 200 無變化、結束後學生 1 秒內看到活動結束、開始新活動後上一場結果保留但不出現在新看板、`ENDED` 事件
- [X] T064 [P] [US5] 在 `backend/tests/integration/activity.restart.test.ts` 撰寫：作答中重啟 → WAITING、該題 NOT_OPENED、`notice` 文案、`RESTART_CANCELLED` 事件；重新開放的題目在作答中重啟 → 恢復為原有效結果（CLOSED），舊輪未作廢（data-model.md §1.7 question_results.voided）；老師重連 3 秒內取得完整狀態（SC-007）
- [X] T065 [P] [US5] 在 `frontend/tests/ActivityControlPage.test.tsx` 補：結束活動確認視窗（未開放題數、作答中文案）、ENDED 摘要與開始新活動確認、斷線時所有操作停用並顯示「連線中斷，正在重新連線，請稍後再操作」、`notice` 提示框

### Implementation for User Story 5

- [X] T066 [US5] 在 `backend/src/services/activityService.ts` 實作 `endActivity(teacherId)`（寫入 `activities.ended_at` 與 `ENDED` 事件，data-model.md §1.1 activities.ended_at），在 `backend/src/routes/activityRoutes.ts` 新增 `POST /end`
- [X] T067 [US5] 在 `backend/src/domain/activityStateMachine.ts` 與 `backend/src/server.ts` 完成重開輪次的重啟還原（research.md R5）：作答中重啟時 data-model.md §1.2 questions.current_round 減 1；該題仍有 `voided = 0` 結果（data-model.md §1.7 question_results.voided）時 data-model.md §1.2 questions.status 回 `CLOSED`，否則回 `NOT_OPENED`；`activities.notice` 依兩種情況寫入「第 N 題作答已取消，可重新開放」或「第 N 題重新作答已取消，保留原結果」；寫入一筆 `RESTART_CANCELLED` 事件。完成標準：T064 全部通過
- [X] T068 [P] [US5] 建立 `frontend/src/activity/ActivitySummary.tsx`（題數、已完成、各題搶答成功組、可點開結果、開始新活動確認）並接入 `ActivityControlPage`；狀態列加入「結束活動」按鈕與確認視窗
- [X] T069 [P] [US5] 在 `frontend/src/pages/ActivityControlPage.tsx` 接上 `ConnectionBanner`、斷線時停用操作、`notice` 提示框，並確認重新整理後依 `GET /api/teacher/activity` 回到正確畫面

**Checkpoint**: 課堂完整流程（開始 → 多題 → 結束 → 新活動）與異常恢復可展示

---

## Phase 8: User Story 6 - 各組在線狀態 (Priority: P3)

**Goal**: 看板顯示各組在線組員數，10 秒內反映

**Independent Test**: A 組 1 人開兩個分頁顯示「在線 1／N」，關閉後 10 秒內離線（spec US6）

### Tests for User Story 6

- [X] T070 [P] [US6] 在 `backend/tests/integration/presence.test.ts` 撰寫：同一學生多分頁計 1 人、連線／斷線觸發 `teacher:update`、節流不超過每 300 ms 一次、斷線在 10 秒內反映

### Implementation for User Story 6

- [X] T071 [US6] 在 `backend/src/realtime/socketServer.ts` 的 `/student` namespace 維護 `Map<studentId, Set<socketId>>` 並提供 `onlineCountByTeam()`，連線變化時節流呼叫 `pushTeachers()`（research.md R10）
- [X] T072 [US6] 在 `backend/src/services/monitorViewBuilder.ts` 填入 `MonitorTeamRow.online`／`members`，並在 `frontend/src/activity/MonitorBoard.tsx` 與 `frontend/src/activity/ActivityStartPanel.tsx` 顯示「在線 x／y」或「離線」

**Checkpoint**: 所有 user story 完成

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: 鎖定組別、開發工具、版面、設計圖一致性與驗收

- [X] T073 在 `backend/src/services/groupService.ts` 的 `assign`、`selfSelect`、`setGroupCount` 呼叫 `assertGroupChangeAllowed()`，並在 `backend/tests/integration/activity.lock.test.ts` 補作答中改組／改組數／學生自選回 409 `GROUP_CHANGE_LOCKED`、其他階段允許（FR-006）
- [X] T074 [P] 更新 `frontend/src/pages/DevTeacherPanel.tsx`：新增「以 mock 題目開始活動」、`next` 改為「回到等待畫面」，並更新 `frontend/tests/DevTeacherPanel.test.tsx`
- [X] T075 [P] 在 `frontend/tests/narrowScreen.test.tsx` 加入活動頁 375 px 與 1440 px、10 組與 50 組情境無水平捲動、按鈕觸控區 ≥ 44 px（SC-009），破壞性按鈕與主要按鈕使用不同 tokens（FR-033）
- [X] T076 擴充 `backend/tests/architecture/diagram-consistency.test.ts` 讀取 `specs/004-activity-control-monitor/plan.md` 與 `diagrams/004-component.puml`、`diagrams/004-class.puml`，驗證組件、類別方法（含 `ActivityLockGuard.bind`、`ActivityStateMachine` 的 dev 方法，皆已列在類別圖，不設例外）與允許清單
- [X] T077 若實作與設計有偏差，更新 `diagrams/004-*.puml` 並執行 `java -jar plantuml.jar "./diagrams/*.puml"` 重新產生 PNG；依 quickstart.md §3 手動比對兩張時序圖，結果寫入 `specs/004-activity-control-monitor/diagram-verification.md`
- [X] T078 [P] 更新根目錄 `README.md` 與 `package.json` 的 description，加入 F5／F8 功能與 `/teacher/activity` 使用說明
- [X] T079 執行 `npm run lint`、`npm run typecheck`、`npm test`，並依 quickstart.md §3 完成手動驗證，將測試指令與實際結果（通過／失敗數）記錄於 `specs/004-activity-control-monitor/manual-validation.md`（憲章原則 V）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無相依
- **Foundational (Phase 2)**: 依賴 Setup；阻擋所有 user story。內部順序：T004～T006（測試）→ T007、T008 → T009 → T010 → T011、T012 → T013、T014 → T015～T018 → T019 → T020、T021；T022、T023 可與後端平行
- **US1 (Phase 3)**: 依賴 Phase 2
- **US2 (Phase 4)**: 依賴 Phase 2；以 US1 的「開始活動」建立測試前置（測試可改用 T003 helper 直接建立活動，因此可與 US1 平行）
- **US3 (Phase 5)**: 依賴 US2 的開放與送出（T041～T045）
- **US4 (Phase 6)**: 依賴 US2 的結束流程（T041～T043）；可與 US3 平行
- **US5 (Phase 7)**: 依賴 US2；可與 US3、US4 平行
- **US6 (Phase 8)**: 依賴 US3 的 `MonitorBoard`
- **Polish (Phase 9)**: T073 只依賴 Phase 2；其餘依賴所需 story 完成

### Within Each User Story

- 測試先寫並確認失敗 → service → route → 前端元件 → 整合進頁面
- 同一檔案的任務依編號順序執行（例如 `activityService.ts`：T029 → T042 → T059 → T066；`monitorViewBuilder.ts`：T017 → T030 → T044 → T053 → T058 → T072）

### Parallel Opportunities

- Phase 1：T002、T003 平行
- Phase 2：T004～T006 平行；T009、T011、T015 平行；T022、T023 與後端平行
- 每個 story 的測試任務（標 [P]）可同時撰寫
- US3、US4、US5 在 US2 完成後可由不同人平行進行

---

## Parallel Example: User Story 2

```bash
# 同時撰寫 US2 的測試：
Task: "T035 activityStateMachine.test.ts 補 open/reopen/冪等/同時結束"
Task: "T036 activity.open.test.ts"
Task: "T037 activity.close.test.ts"
Task: "T038 activity.reopen.test.ts"
Task: "T039 submit.parts.test.ts"
Task: "T040 OpenQuestionForm.test.tsx 與 AnsweringView.test.tsx"

# 後端完成 T041～T045 後，同時做前端：
Task: "T046 OpenQuestionForm.tsx"
Task: "T047 AnsweringView.tsx／AnswerInput.tsx 題組多作答框"
```

## Parallel Example: User Story 3 與 4

```bash
Task: "T049 monitorViewBuilder.test.ts"       # US3
Task: "T056 activity.result.test.ts"          # US4
Task: "T055 MonitorBoard.tsx"                 # US3
Task: "T060 ResultBoard.tsx"                  # US4
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational（**確認 002／003 既有測試全綠**）
2. Phase 3 US1 → 驗證開始活動與鎖定
3. Phase 4 US2 → 驗證逐題開放、計時、重開
4. Phase 5 US3＋Phase 6 US4 → 完成 M3 Demo 情境（開放 60 秒 → 多組送出 → 老師看到順序 → 結束後顯示結果）
5. **STOP and VALIDATE**：依 quickstart.md §3.1～§3.4 驗收

### Incremental Delivery

1. MVP（US1～US4）
2. US5：結束活動與異常恢復
3. US6：在線狀態
4. Polish：組別鎖定、版面、設計圖一致性與回報

---

## Notes

- [P] = 不同檔案且不依賴未完成任務
- 欄位限制以 `data-model.md` 為準，任務只引用不重抄
- 每完成一個 checkpoint 執行 `npm test`；完成回報需附指令與實際結果（憲章原則 V）
- 設計偏離圖表時先更新 `diagrams/004-*.puml` 與 PNG（憲章原則 VI）

## Phase 10: Convergence

- [X] T080 讓 `/api/teacher/activity/*` 對學生回覆的 403 訊息為「權限不足」（hint 說明此功能僅限老師使用），在 `backend/src/routes/activityRoutes.ts` 以老師專用的角色檢查取代沿用 001 的「此功能僅限老師使用」訊息，並在 `backend/tests/integration/activity.auth.test.ts` 斷言訊息內容 per FR-027、US1/AC7 (contradicts)
- [X] T081 老師的 `/teacher` socket 因 session 失效被拒（`UNAUTHORIZED`）時，`frontend/src/activity/useTeacherActivity.ts` 改為重新以 REST 取得狀態以觸發 401 導向登入頁，而非停在「連線中斷」，並在 `frontend/tests/ActivityControlPage.test.tsx` 補測試 per spec Edge Case「老師 session 逾時」 (partial)
