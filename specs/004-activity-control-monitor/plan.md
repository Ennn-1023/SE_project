# Implementation Plan: 活動管理與逐題開放控制＋老師即時監控看板（F5＋F8）

**Branch**: `004-activity-control-monitor` | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-activity-control-monitor/spec.md`

**Note**: This template is filled in by the `$speckit-plan` command; its definition describes the execution workflow.

## Summary

老師以 003 匯入的題目集與 001 的組別「開始活動」，逐題選題、設定秒數（5～600，預設 60）開放搶答；伺服器計時到點自動結束，老師可手動提前結束、在結果畫面直接開放下一題、經確認重新開放已結束題目（新一輪取代舊結果、舊輪作廢保留），最後結束整場活動（F5）。作答中老師看板即時顯示各組送出狀態、順位、距開放秒數、送出者與答案（題組依小題），結束後顯示結果並可回顧本場任一題（F8）。學生端補上「目前沒有進行中的活動」與題組多作答框。

技術做法：**擴充 002 既有的伺服器權威架構**——`ActivityStateMachine`（允許 CLOSED → ANSWERING、`reopen`、`backToWaiting`、可為無活動）、`SubmissionService`（依小題答案、輪次）、`ResultService`（結束時同一交易作廢舊輪＋寫入新輪）、`Repository`（migration v4）。新增老師端 `ActivityService`、`MonitorViewBuilder`、`ActivityLockGuard`、`ActivityRoutes`、`ActivityEventRepository`，Socket.IO 新增 `/teacher` namespace 推 `teacher:update`（與 REST 同一份 `TeacherActivityView`）。學生隔離沿用 002 的 `buildView`，監控資料只在 `/teacher` 產生。架構依 `./diagrams/004-*.puml`（憲章原則 VI），決策見 [research.md](research.md)。

## Technical Context

**Language/Version**: TypeScript 6（`strict: true`），Node.js ≥ 24（沿用）

**Primary Dependencies**:
- 後端：沿用 Express 5、zod 4、socket.io 4、`node:sqlite`。**不新增執行期套件**。
- 前端：沿用 React 19、react-router 7、Tailwind v4、socket.io-client。
- 共用：`@buzzer/shared` 新增 `activity.ts`（`ActivityRules`、DTO 型別），擴充 `errorCodes.ts`、`types.ts`。

**Storage**: SQLite，migration version 4：擴充 `activities`、`questions`，重建 `submissions`、`question_results`（加輪次與作廢），新增 `question_parts`、`question_participants`、`submission_parts`、`result_parts`、`activity_events`（[data-model.md](data-model.md)）。

**Testing**: Vitest（shared、backend、frontend）；後端 supertest＋socket.io-client；計時用 fake timers；架構測試 `diagram-consistency.test.ts` 擴充至 004（research R13）。

**Target Platform**: Node.js 伺服器；近兩年主流手機、平板、桌機瀏覽器。

**Project Type**: Web application（frontend＋backend＋shared）

**Performance Goals**: 階段變化與送出在 1 秒內推到所有老師與學生畫面（SC-002、SC-003，測試規模 10 組＋2 個老師連線）；時間到誤差 ≤ 1 秒（SC-004）；重新整理／重連 3 秒內恢復（SC-007）；在線狀態 10 秒內反映（FR-022）。

**Constraints**: 伺服器為唯一真實來源；學生端 0 筆監控資料（SC-006）；每題同時只有一輪有效結果（SC-011）；作答中重啟可恢復重開前結果；375 px 無水平捲動（SC-009）；不新增機敏環境變數。

**Scale/Scope**: 單一老師、同時一場活動；每場最多 200 題、每題 10 小題；以 10 組為主要情境、看板須支援 50 組；8 個新 REST 端點＋1 個 socket namespace；1 個新頁面、7 個新前端元件；4 張設計圖。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 檢查項目 | Phase 0 前 | Phase 1 後 | 依據 |
|------|----------|-----------|-----------|------|
| I. 輸入驗證 | `seconds`、`questionId`、`confirm`、`answers[]` 在進入點以 zod＋`ActivityRules` 驗證；學生送出仍以伺服器判定；鎖定規則在 service 層 | ✅ 規劃 | ✅ [openapi.yaml](contracts/openapi.yaml) 每個端點 schema；驗證表見 [data-model.md §4](data-model.md) | R6、R8、R11 |
| II. 清楚錯誤訊息 | 新增 11 個錯誤碼，皆含 message＋hint；題組錯誤指出小題；不含內部細節 | ✅ 規劃 | ✅ openapi `ErrorResponse` 列出所有碼與訊息 | R12 |
| III. 機敏資料只放環境變數 | 不新增機敏變數；活動事件不記錄答案內容 | ✅ 無新增 | ✅ `activity_events.detail` 只含組名、秒數、原因 | data-model §1.9 |
| IV. 正常＋邊界案例測試 | 每個 FR 有正常與邊界案例；秒數邊界、同時結束 100 次、重開後重啟、隔離、小題空白皆有測試 | ✅ 規劃 | ✅ [quickstart.md §2](quickstart.md) 測試群組對照 spec | R13 |
| V. 回報測試指令與結果 | `npm test` 與分區指令 | ✅ 規劃 | ✅ quickstart §2 | quickstart |
| VI. PlantUML 設計優先 | 組件圖、類別圖、2 張時序圖與 PNG 已產生並於 clarify／plan 時同步；plan 以圖為藍圖 | ✅ 4 張圖與 PNG | ✅ 下方對照表；`diagram-consistency.test.ts` 擴充為 001＋003＋004 | R1 |

**Gate 結果**：全部通過，無需填寫 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/004-activity-control-monitor/
├── plan.md              # 本文件
├── research.md          # Phase 0：設計決策
├── data-model.md        # Phase 1：migration v4、狀態轉換、共用型別、驗證規則
├── quickstart.md        # Phase 1：測試指令與手動驗證情境
├── contracts/
│   ├── openapi.yaml     # REST API（老師活動、學生送出變更、鎖定、dev）
│   ├── socket-events.md # /teacher namespace 與 /student 變更
│   └── ui-routes.md     # 前端路由、版面與畫面狀態
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2（/speckit-tasks 產生）

diagrams/
├── 004-component.puml / .png
├── 004-class.puml / .png
├── 004-sequence-question.puml / .png
└── 004-sequence-lifecycle.puml / .png
```

### Source Code (repository root)

```text
shared/src/
├── activity.ts                        # 新增：ActivityRules（validateSeconds、validatePartAnswers）、DTO 型別
├── errorCodes.ts                      # 新增 11 個錯誤碼、修改 INVALID_SECONDS／QUESTION_ALREADY_CLOSED 訊息
├── types.ts                           # StudentView 擴充（NO_ACTIVITY、parts、answers）
└── index.ts                           # 匯出 activity.ts
shared/tests/activity.test.ts

backend/src/
├── db/
│   ├── migrations.ts                  # version 4
│   └── activityEventRepository.ts     # 新增
├── data/
│   ├── repositories.ts                # 002 Repository 擴充：活動題目、小題、參與組別、輪次、作廢、建立活動交易
│   └── mock/seed.ts                   # 改為由 dev 端點呼叫，不再於啟動時自動執行
├── domain/
│   ├── buzzerTypes.ts                 # Activity、Question、Submission、QuestionResult 擴充；ActivityQuestion、QuestionPart、ParticipatingTeam、PartAnswer、ActivityEvent
│   ├── activityStateMachine.ts        # 擴充：null 狀態、start、open from CLOSED、reopen、backToWaiting、recoverAfterRestart 回傳通知
│   ├── submissionService.ts           # 擴充：輪次、小題答案、相容單一 answer
│   ├── resultService.ts               # 擴充：finalize 含輪次與作廢
│   └── visibilityFilter.ts            # 擴充：NO_ACTIVITY、parts、answers（仍不含監控資料）
├── services/
│   ├── activityService.ts             # 新增：老師操作、冪等規則、事件紀錄
│   ├── monitorViewBuilder.ts          # 新增：TeacherActivityView、ResultBoardView
│   ├── activityLockGuard.ts           # 新增：題目集與組別鎖定
│   ├── groupService.ts                # assign／selfSelect／setGroupCount 呼叫 assertGroupChangeAllowed
│   ├── questionSetService.ts          # clear／reimport 呼叫 assertQuestionSetMutable
│   └── questionImportService.ts       # confirm 呼叫 assertQuestionSetMutable
├── schemas/activity.ts                # 新增：openBody、reopenBody、questionIdParams
├── routes/activityRoutes.ts           # 新增：/api/teacher/activity
├── http/routes/student.ts             # submitSchema 接受 answers[]
├── http/routes/devTeacher.ts          # 新增 POST /mock-activity；next → back-to-waiting
├── http/middleware/auth.ts            # 新增 authenticateTeacherCookie
├── realtime/socketServer.ts           # /teacher namespace、pushTeachers、在線追蹤、ping 設定
├── context.ts                         # Realtime 介面加入 pushTeachers；AppContext 加入 activities、monitor
├── app.ts                             # 組裝 ActivityLockGuard（createContainer）、掛載 activityRoutes
└── server.ts                          # 綁定 lock guard、hooks、移除自動 seed

backend/tests/
├── unit/                              # activityStateMachine、resultService、submissionService、monitorViewBuilder、activityLockGuard、migrations（v4）
├── integration/                       # activity.start/open/close/reopen/end/lock/auth/restart、monitor.sync/isolation、submit.parts、presence；既有 002 測試改用 helper 建立活動
├── helpers/activity.ts                # 建立老師、學生、分組、題目集或 mock 活動的 helper
└── architecture/diagram-consistency.test.ts   # 加入 004

frontend/src/
├── api/apiClient.ts                   # 新增 teacherActivity 方法；submit 改送 answers[]
├── realtime/socket.ts                 # 新增 connectTeacher()
├── pages/
│   ├── TeacherDashboard.tsx           # 新增「搶答活動」按鈕
│   ├── ActivityControlPage.tsx        # 新增 /teacher/activity
│   └── DevTeacherPanel.tsx            # 新增 mock 活動按鈕、next → 回到等待
├── activity/
│   ├── ActivityStartPanel.tsx
│   ├── ActivityQuestionList.tsx
│   ├── OpenQuestionForm.tsx
│   ├── MonitorBoard.tsx
│   ├── ResultBoard.tsx
│   ├── ActivitySummary.tsx
│   └── useTeacherActivity.ts
├── components/
│   ├── AnsweringView.tsx              # 題組多作答框
│   ├── AnswerInput.tsx                # 支援小題標籤
│   ├── ResultView.tsx                 # 依小題分列
│   └── WaitingView.tsx                # NO_ACTIVITY 文案
└── main.tsx                           # /teacher/activity 路由
frontend/tests/                        # 上述新元件與變更元件、narrowScreen（活動頁 375 px）
```

**Structure Decision**: 沿用專案現況的兩套分層：002 的搶答核心（`domain/`、`data/`、`http/`、`realtime/`）原地擴充，避免另立第二個真實來源；老師端新元件依 001／003 慣例放在 `routes/`、`services/`、`db/`，並納入設計圖一致性測試。共用驗證與 DTO 放 `shared`，前後端同一份。

## 設計圖對照表（憲章原則 VI）

### 組件圖 → 檔案（[004-component.puml](../../diagrams/004-component.puml)）

| 組件 | 檔案 | 組件 | 檔案 |
|------|------|------|------|
| TeacherDashboard | `frontend/src/pages/TeacherDashboard.tsx` | ActivityRoutes | `backend/src/routes/activityRoutes.ts` |
| ActivityControlPage | `frontend/src/pages/ActivityControlPage.tsx` | StudentRoutes | `backend/src/http/routes/student.ts` |
| ActivityStartPanel | `frontend/src/activity/ActivityStartPanel.tsx` | QuestionSetRoutes | `backend/src/routes/questionSetRoutes.ts` |
| ActivityQuestionList | `frontend/src/activity/ActivityQuestionList.tsx` | GroupRoutes | `backend/src/routes/groupRoutes.ts` |
| OpenQuestionForm | `frontend/src/activity/OpenQuestionForm.tsx` | RequireAuth / RequireRole | `backend/src/middleware/requireAuth.ts`、`backend/src/middleware/requireRole.ts`、`backend/src/middleware/validate.ts`、`backend/src/middleware/errorHandler.ts` |
| MonitorBoard | `frontend/src/activity/MonitorBoard.tsx` | ActivityService | `backend/src/services/activityService.ts` |
| ResultBoard | `frontend/src/activity/ResultBoard.tsx` | ActivityStateMachine | `backend/src/domain/activityStateMachine.ts` |
| ActivitySummary | `frontend/src/activity/ActivitySummary.tsx` | SubmissionService | `backend/src/domain/submissionService.ts` |
| 老師即時狀態 | `frontend/src/activity/useTeacherActivity.ts` | ResultService | `backend/src/domain/resultService.ts` |
| 伺服器倒數 | `frontend/src/hooks/useServerCountdown.ts` | MonitorViewBuilder | `backend/src/services/monitorViewBuilder.ts` |
| StudentPage | `frontend/src/pages/StudentPage.tsx`、`frontend/src/components/AnsweringView.tsx` | VisibilityFilter | `backend/src/domain/visibilityFilter.ts` |
| ApiClient | `frontend/src/api/apiClient.ts` | ActivityLockGuard | `backend/src/services/activityLockGuard.ts` |
| SocketClient | `frontend/src/realtime/socket.ts` | QuestionSetService | `backend/src/services/questionSetService.ts` |
| ActivityRules | `shared/src/activity.ts` | GroupService | `backend/src/services/groupService.ts` |
| SocketServer | `backend/src/realtime/socketServer.ts` | Repository | `backend/src/data/repositories.ts` |
| ActivityEventRepository | `backend/src/db/activityEventRepository.ts` | QuestionSetRepository | `backend/src/db/questionSetRepository.ts` |
| Logger | `backend/src/lib/logger.ts` | 資料庫 | SQLite（`backend/src/lib/db.ts`） |

`ActivityRules` 以 `export const ActivityRules = { validateSeconds, validatePartAnswers }` 匯出（各函式亦個別匯出）。`VisibilityFilter` 以 `export const visibilityFilter = { buildView }` 匯出；`SocketServer` 為 `createRealtime` 回傳的型別；`SocketClient` 為前端學生與老師連線的聯集型別。`老師即時狀態`、`伺服器倒數` 為 hook（小寫開頭，組件圖以中文名稱對應）。

### 類別圖 → 程式型別（[004-class.puml](../../diagrams/004-class.puml)）

| 類別圖元素 | 程式位置 |
|-----------|----------|
| `ActivityPhase`、`PartAnswer` | `shared/src/types.ts` |
| `ActivityQuestionStatus`、`ClosedReason`、`TeacherActivityView`、`MonitorView`、`MonitorTeamRow`、`ActivityRules` | `shared/src/activity.ts` |
| `QuestionKind` | `shared/src/annotation.ts`（003，`activity.ts` 重新匯出） |
| `Activity`、`ActivityQuestion`、`QuestionPart`、`ParticipatingTeam`、`Submission`、`QuestionResult`、`ActivityEvent`、`ActivityEventType` | `backend/src/domain/buzzerTypes.ts`（純型別）；資料表見 [data-model.md](data-model.md) |
| `ActivityStateMachine`、`SubmissionService`、`ResultService` | `backend/src/domain/` 同名檔；公開方法與類別圖相同 |
| `ActivityService`、`MonitorViewBuilder`、`ActivityLockGuard` | `backend/src/services/` 同名檔；公開方法與類別圖相同（含 `ActivityLockGuard.bind`） |

### 基礎設施檔案允許清單

| 檔案 | 角色 |
|------|------|
| `backend/src/schemas/activity.ts` | `Validate` 使用的 zod schema（對應 [openapi.yaml](contracts/openapi.yaml)） |
| `backend/src/db/migrations.ts` | version 4 資料表 |
| `backend/src/context.ts`、`backend/src/server.ts`、`backend/src/app.ts` | 組裝與啟動 |
| `backend/src/http/middleware/auth.ts` | socket 與學生 REST 的 cookie 驗證（新增老師版本） |
| `backend/src/http/routes/devTeacher.ts`、`backend/src/data/mock/seed.ts` | 開發專用模擬操作（FR-032） |
| `frontend/src/main.tsx` | 新增 `/teacher/activity` 路由 |

### 時序圖 → 程式流程

| 時序圖 | 端點／事件 | 主要測試 |
|--------|------------|----------|
| [004-sequence-question](../../diagrams/004-sequence-question.puml)：開放 | `POST /api/teacher/activity/open`、`teacher:update`、`state:update` | `activity.open.test.ts`、`monitor.sync.test.ts` |
| 同上：即時監控 | `POST /api/student/submissions` → `pushToTeam` → `pushTeachers` | `monitor.sync.test.ts`、`monitor.isolation.test.ts`、`submit.parts.test.ts` |
| 同上：時間到／手動結束 | `POST /api/teacher/activity/close`、計時器 | `activity.close.test.ts`、`activityStateMachine.test.ts` |
| 同上：直接開放下一題、重新開放、回到等待 | `open`（CLOSED 起始）、`reopen`、`back-to-waiting` | `activity.open.test.ts`、`activity.reopen.test.ts` |
| [004-sequence-lifecycle](../../diagrams/004-sequence-lifecycle.puml)：開始活動 | `POST /api/teacher/activity/start` | `activity.start.test.ts` |
| 同上：鎖定題目集 | `DELETE /api/question-set`、`POST /api/question-set/reimport`、`POST /api/question-import/drafts/{id}/confirm` | `activity.lock.test.ts` |
| 同上：重新整理恢復 | `GET /api/teacher/activity`、`/teacher` 連線 | `monitor.sync.test.ts`、`activity.restart.test.ts` |
| 同上：結束活動 | `POST /api/teacher/activity/end` | `activity.end.test.ts` |

## 實作要點

1. **狀態機為同步臨界區**：`open`／`reopen`／`closeQuestion`／`backToWaiting`／`end` 都是同步方法，先檢查再寫入，再呼叫 hooks 與推播（R11）。`closeQuestion` 對非 `ANSWERING` 回傳 `false`，確保只結束一次。
2. **結束交易順序**：`onQuestionClosed` → `ResultService.finalize`（作廢較早輪次＋寫入本輪 `submissions`／`submission_parts`／`question_results`／`result_parts`）→ 更新題目與活動狀態 → `pushAll` → `pushTeachers`。
3. **重啟恢復**：`server.ts` 在建立狀態機後呼叫 `recoverAfterRestart()`，若回傳通知文字則寫入 `activities.notice` 與 `RESTART_CANCELLED` 事件（R5）。
4. **鎖定注入**：`createContainer` 建立未綁定的 `ActivityLockGuard` 並傳給 `GroupService`、`QuestionSetService`、`QuestionImportService`；`startServer` 建立狀態機後 `bind()`（R8）。
5. **002 測試相容**：移除啟動時自動 seed 後，002 的整合測試改用 `tests/helpers/activity.ts` 建立 mock 活動；`next` 相關測試改為 `back-to-waiting`。
6. **前端狀態合併**：`useTeacherActivity` 以 REST 回應與 `teacher:update` 中 `serverNow` 較新者為準；倒數一律用 `endsAt`＋`serverNow` 校正（沿用 `useServerCountdown`）。
7. **投影提醒**：作答中看板頂端常駐提醒（FR-015），以撞色邊框呈現，不可關閉。

## Complexity Tracking

無違反憲章的項目。
