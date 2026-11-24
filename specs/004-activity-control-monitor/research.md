# Research: 活動管理與逐題開放控制＋老師即時監控看板（F5＋F8）

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-24

本功能建立在既有程式上（001 登入／組別、002 學生搶答與 `ActivityStateMachine`、003 題目集），Technical Context 沒有未知技術項目；以下記錄每個設計決策、理由與被否決的方案。

---

## R1. 擴充 002 的狀態機與 Repository，而不是另寫一套

- **Decision**: 沿用 `backend/src/domain/activityStateMachine.ts`、`submissionService.ts`、`resultService.ts`、`visibilityFilter.ts` 與 `backend/src/data/repositories.ts`，在原檔擴充；新增的老師端元件（`ActivityService`、`MonitorViewBuilder`、`ActivityLockGuard`、`ActivityRoutes`、`ActivityEventRepository`）依 001／003 的分層放在 `routes/`、`services/`、`db/`。
- **Rationale**: 002 已實作伺服器計時、冪等結束、作答中重啟捨棄、學生視角過濾，並有完整測試（`activityStateMachine.test.ts`、`restart.test.ts`、`isolation.test.ts` 等）。另寫一套會讓學生端與老師端的真實來源分裂。
- **Alternatives**: (a) 新建 `ActivityRepository`、`SubmissionRepository` 取代 002 的 `Repository`——要同時改寫 002 全部測試，風險高、無功能收益，已否決並同步修改組件圖。(b) 把狀態機搬到 `services/`——只是搬家，會讓 002 圖表與程式不一致。

## R2. 「沒有進行中的活動」狀態

- **Decision**: `ActivityStateMachine.state` 改為 `Activity | null`。DB 中沒有任何活動列時為 `null`，對外的視圖階段為 `NONE`（老師）／`NO_ACTIVITY`（學生）。上一場 `ENDED` 後仍以該場為目前活動（學生維持顯示「活動已結束」），直到老師開始新活動。
- **Rationale**: 符合 spec FR-030（無活動時的學生提示）與 US5（結束後顯示摘要、可開始新活動）；不需要新增階段到 DB 的 `CHECK` 約束。
- **Migration**: version 4 將舊資料中 002 的 mock 活動（`id = 'A1'`）若未結束則標為 `ENDED`，`startServer` 不再自動 `seedMockData`。開發用 mock 改由 `POST /api/dev/teacher/mock-activity`（只在 `ENABLE_DEV_TOOLS=true`）建立，保留 002 的獨立測試能力（FR-032）。
- **Alternatives**: 新增 `PREPARING` 階段寫進 DB——roadmap 的「準備中」其實就是「已匯入、未開始」，沒有需要保存的狀態，否決。

## R3. 開始活動時複製題目集（快照）

- **Decision**: `ActivityService.startActivity` 在單一交易中：建立 `activities` 列、把 `QuestionSetRepository` 目前題目逐題複製到 `questions`（擴充欄位：`label`、`kind`、`stem`、`status`、`current_round`…）與新表 `question_parts`。`question_id` 為 `{activityId}-{position}`，`activityId` 為 `ACT-{yyyyMMddHHmmss}-{4 碼隨機}`。
- **Rationale**: FR-002 要求本場題目不受之後題目集變動影響；F10 寫回需要每個小題對應 003 的 `answer_slots`，因此 `question_parts` 保留 `question_key`＋`part_index` 以便回查標註。
- **Alternatives**: 活動直接引用 `question_set_questions`——003 重新匯入會整份取代題目集，舊活動資料會斷鏈，否決。

## R4. 「直接開放下一題」與「回到等待畫面」

- **Decision**: 狀態機 `open()` 允許 `WAITING` 或 `CLOSED` 起始；原 002 的 `next()` 改名為 `backToWaiting()`（只在 `CLOSED` 可用，`WAITING` 時為無變化）。學生在 `CLOSED` 時持續看到上一題結果，`open()` 觸發的推播直接把畫面換成新題。
- **Rationale**: Clarification Q3（2026-11-24）。
- **Preselect**: `MonitorViewBuilder` 計算 `preselectedQuestionId`＝目前題目之後第一個 `NOT_OPENED`，找不到則從頭找；全部結束時為 `null`（前端顯示「本場題目已全部完成，可結束活動」）。

## R5. 重新開放與作廢（輪次）

- **Decision**: 每題有 `current_round`（首次開放為 1）。`reopen(questionId, seconds)` 只允許狀態為 `CLOSED` 的題目，且 API 必須帶 `confirm: true`，否則回 409 `REOPEN_NOT_CONFIRMED`。開放新一輪時**不立即**作廢舊結果；新一輪結束時，`ResultService.finalize` 在同一交易中把該題 `round < 新輪次` 且未作廢的 `submissions`、`question_results` 設為 `voided = 1`，再寫入新一輪資料。
- **Rationale**: 符合 FR-007a（只有一輪有效）與 Edge Case「重新開放後伺服器在作答中重啟 → 恢復原結果」。若在開放時就作廢，重啟後必須「反作廢」，狀態更難推理。
- **讀取規則**: 所有給看板、學生、F10／F11 的查詢一律加 `voided = 0`；作答中則只讀記憶體中本輪送出。
- **Restart**: `recoverAfterRestart()` 若重啟時為 `ANSWERING`：題目 `current_round` 減 1；若該題仍有未作廢結果則狀態回 `CLOSED`，否則回 `NOT_OPENED`；活動回 `WAITING`；回傳通知文字給 `ActivityService` 存入 `activities.notice`（老師連線時顯示，下一次操作後清除）。
- **Alternatives**: 刪除舊輪資料——違反「保留在紀錄中」；每輪都有效——為 Clarification 選項 C，已被否決。

## R6. 題組作答：每小題一個答案、一次送出

- **Decision**: 學生送出 API 改為 `{ questionId, answers: string[] }`，長度必須等於該題小題數（單題為 1）；仍接受 002 的 `{ questionId, answer }` 並視為 `answers: [answer]`（僅限單題）。驗證規則放在 `shared/src/activity.ts` 的 `validatePartAnswers`：逐一去除前後空白、1～500 字（沿用 `validateAnswer`），第一個不合格的小題回傳 `PART_ANSWER_EMPTY`／`PART_ANSWER_TOO_LONG`，`field = "answers[i]"`，訊息含小題標籤（例如「第（2）小題答案不可為空」）。
- **Storage**: `submissions.answer` 保留為顯示用的合併文字（單題＝原答案；題組＝`（1）…\n（2）…`），新表 `submission_parts` 存每小題答案；`question_results` 同理，另以 `result_parts` 保存成功組各小題答案供 F10。
- **Rationale**: Clarification Q1（2026-11-24）；保留 `answer` 欄可讓 002 既有查詢與 dev 結果 API 不需改寫。
- **Alternatives**: 以 JSON 字串存在單一欄位——無法以 SQL 檢查每小題長度，也不利 F10 逐格查詢，否決。

## R7. 參與組別

- **Decision**: 組別來自 001 的 `group_settings.group_count`（第 1..N 組，teamId `T{n}`）。開放（含重新開放）時，`ActivityService` 計算「目前至少有 1 位學生的組別」寫入 `question_participants(activity_id, question_id, round, team_id, member_count)`，看板分母與「未送出」列表以此為準。
- **Start precondition**: 至少一題、至少一組有成員；否則 409 `NO_QUESTION_SET`／`NO_TEAM_MEMBERS`。
- **送出資格**: 作答中組別歸屬被鎖定（R8），且 001 建立學生帳號時不指定組別，因此作答中不會出現「開放後才有成員」的組別；看板列即本輪參與組別。`SubmissionService` 仍以學生目前組別判定，不另設參與名單檢查。
- **Alternatives**: 為開放後才加入的組另設看板列與旗標——在鎖定規則下不會發生，屬多餘邏輯，已於 /speckit-analyze（I2）移除。

## R8. 鎖定規則（ActivityLockGuard）

- **Decision**: `ActivityLockGuard` 在 `createContainer` 中建立，持有一個可延後綁定的階段讀取函式（`bind(() => machine.activity?.phase ?? null)`，於 `startServer` 綁定；未綁定時視為無活動，001／003 既有測試不受影響）。
  - `assertQuestionSetMutable()`：有活動且階段不是 `ENDED` → 409 `QUESTION_SET_LOCKED`。呼叫點：`QuestionSetService.clear`、`QuestionSetService.reimport`、`QuestionImportService.confirm`（讀取學習單與標註草稿不鎖，讓老師可先準備下一份）。
  - `assertGroupChangeAllowed()`：階段為 `ANSWERING` → 409 `GROUP_CHANGE_LOCKED`。呼叫點：`GroupService.assign`、`GroupService.selfSelect`、`GroupService.setGroupCount`。
- **Alternatives**: 在 route 層檢查——003／001 的 service 也被其他 service 呼叫（例如 reimport），放在 service 才不會漏，否決 route 層。

## R9. 老師即時推播與監控資料

- **Decision**: Socket.IO 新增 `/teacher` namespace，以同一個 session cookie 驗證且角色須為 `TEACHER`；伺服器只推 `teacher:update`（payload＝`TeacherActivityView`，與 `GET /api/teacher/activity` 相同）。觸發點：狀態機 `onChange`、送出被接受、在線人數變化（節流 300 ms）。學生 namespace 與 payload 不變（加上小題答案與 `NO_ACTIVITY`），`MonitorView` 只在 `/teacher` 產生，學生端永遠拿不到（FR-021、SC-006）。
- **Rationale**: 沿用 002 的「伺服器權威＋重連後立即送完整狀態」模式；一份 DTO 同時用於 REST 與推播，重新整理與重連邏輯相同（FR-024）。
- **送出時間**: `elapsedSeconds = round((receivedAt − openedAt) / 100) / 10`；`openedAt` 存在 `activities.opened_at` 與 `questions.opened_at`。

## R10. 在線狀態（P3）

- **Decision**: `/student` namespace 維護 `Map<studentId, Set<socketId>>`；組在線人數＝該組有至少一個連線的學生數（同一學生多分頁算 1）。Socket.IO 伺服器設定 `pingInterval: 4000`、`pingTimeout: 5000`，異常斷線最慢約 9 秒偵測，滿足「10 秒內反映」。
- **Alternatives**: 前端定時 heartbeat API——多一條路徑，且 Socket.IO 已有 ping，否決。

## R11. 冪等與並行

- **Decision**: Node.js 單執行緒下，狀態機方法皆為同步函式，檢查與狀態寫入不會被插入。重複操作規則（FR-014）：

| 操作 | 已處於目標狀態時 | 其他非法狀態 |
|------|------------------|--------------|
| open(Q) | 目前即 Q 且 `ANSWERING` → 200 無變化 | 409 `INVALID_TRANSITION`（作答中其他題）、409 `QUESTION_ALREADY_CLOSED`（請改用重新開放） |
| reopen(Q) | 目前即 Q 且 `ANSWERING` → 200 無變化 | 409 `QUESTION_NOT_CLOSED`、409 `REOPEN_NOT_CONFIRMED` |
| close | 目前題目已 `CLOSED` → 200 無變化（與時間到同時發生時老師不會看到錯誤，US2-5） | 409 `INVALID_TRANSITION` |
| back-to-waiting | 已 `WAITING` → 200 無變化 | 409 `INVALID_TRANSITION` |
| end | 已 `ENDED` → 200 無變化 | 409 `NO_ACTIVITY` |
| start | — | 已有未結束活動 → 409 `ACTIVITY_ALREADY_RUNNING` |

- 前端在請求進行中停用按鈕；斷線時停用所有操作並顯示「連線中斷，正在重新連線，請稍後再操作」（FR-025）。

## R12. 錯誤碼與訊息

- **Decision**: 在 `shared/src/errorCodes.ts` 的 `ERROR_DEFS` 新增：`NO_ACTIVITY`、`ACTIVITY_ALREADY_RUNNING`、`NO_QUESTION_SET`、`NO_TEAM_MEMBERS`、`QUESTION_NOT_CLOSED`、`REOPEN_NOT_CONFIRMED`、`QUESTION_SET_LOCKED`、`GROUP_CHANGE_LOCKED`、`PART_ANSWER_EMPTY`、`PART_ANSWER_TOO_LONG`、`PART_COUNT_MISMATCH`；修改 `INVALID_SECONDS` 訊息為「作答秒數須為 5～600 的整數」、`QUESTION_ALREADY_CLOSED` 提示改用「重新開放」。001／003 的 service 若使用 `lib/errors.ts` 的 `AppError`，鎖定錯誤以相同 code 與 409 狀態回應，格式一致（`{ error: { code, field, message, hint } }`）。完整清單見 [contracts/openapi.yaml](contracts/openapi.yaml)。

## R13. 測試策略

- **Unit（Vitest）**: `activityStateMachine`（WAITING/CLOSED → open、reopen、backToWaiting、冪等、時間到與手動結束同時 100 次）、`resultService`（輪次作廢交易）、`submissionService`（小題驗證、單題相容）、`monitorViewBuilder`（順位、elapsed、未送出、預選題目、在線）、`activityLockGuard`、shared `activity.test.ts`（`validateSeconds` 邊界 4／5／600／601／60.5／"60"／空白、`validatePartAnswers`）。計時以 Vitest fake timers。
- **Integration（supertest＋socket.io-client）**: `activity.start`、`activity.open`、`activity.reopen`、`activity.end`、`activity.lock`（題目集／組別）、`activity.auth`（學生 403、未登入 401）、`monitor.sync`（10 組同時送出、兩個老師連線一致、1 秒內）、`monitor.isolation`（學生端 0 筆監控資料）、`activity.restart`（作答中重啟、重開後重啟恢復原結果）、`presence`。
- **Frontend（Vitest＋Testing Library）**: `ActivityControlPage`、`OpenQuestionForm`、`MonitorBoard`、`ResultBoard`、`ActivityQuestionList`、`AnsweringView`（題組多框）、`ResultView`（小題分列）、窄螢幕 375 px。
- **Architecture**: `diagram-consistency.test.ts` 擴充讀取 `004-*`（plan 對照表）。
- 測試資料皆為虛構；不需新的環境變數。
