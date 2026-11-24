# 圖表一致性驗證（憲章 v1.1.0 原則 VI）

**功能**：002-student-buzzer　**驗證日期**：2026-11-22
**圖表**：[`diagrams/student-component.puml`](../../diagrams/student-component.puml)、[`student-class.puml`](../../diagrams/student-class.puml)、[`student-sequence.puml`](../../diagrams/student-sequence.puml)
**PNG 產生方式**：`java -jar tools/plantuml.jar "./diagrams/*.puml"`（PlantUML 1.2026.10、Temurin JRE 21、Graphviz）

## 結論

程式碼與更新後的三張圖表**一致**。

驗證時發現原圖表有幾處與已實作（並已通過 converge 驗證）的設計不符，屬於圖表落後於程式碼，不是程式碼偏離規格。因此依原則 VI「經確認設計變更後同步更新圖表」更新了三張圖，並重新產生 PNG。下表列出每一項的修正內容。

## 1. 組件圖：組件 ↔ 程式模組

| 組件 | 程式模組 | 結果 |
|------|----------|------|
| StudentPage | `frontend/src/pages/StudentPage.tsx` | ✅（原圖名為 StudentApp，已改名） |
| WaitingView／AnsweringView／ResultView／ActivityEndedView | `frontend/src/components/*View.tsx` | ✅ |
| CountdownTimer／AnswerInput | `frontend/src/components/CountdownTimer.tsx`、`AnswerInput.tsx` | ✅ |
| ConnectionBanner | `frontend/src/components/ConnectionBanner.tsx` | ✅（原圖缺，已補） |
| useStudentState／useServerCountdown | `frontend/src/hooks/*.ts` | ✅（原圖缺，已補） |
| api/client | `frontend/src/api/client.ts` | ✅（原圖缺，已補） |
| realtime/socket | `frontend/src/realtime/socket.ts` | ✅ |
| DesignTokens | `frontend/src/styles/tokens.css` | ✅ |
| DevLoginPage／DevTeacherPanel | `frontend/src/pages/Dev*.tsx` | ✅（原圖缺，已補） |
| answerRules／errorCodes／realtime（shared） | `shared/src/*.ts` | ✅（原圖缺 shared 套件，已補） |
| config/env | `backend/src/config/env.ts` | ✅（已補） |
| StudentRouter | `backend/src/http/routes/student.ts` | ✅（原名 StudentStateAPI；實際也負責送出） |
| AuthMiddleware／ErrorHandler | `backend/src/http/middleware/auth.ts`、`errorHandler.ts` | ✅（已補） |
| SocketServer | `backend/src/realtime/socketServer.ts` | ✅（原名 RealtimeGateway） |
| ActivityStateMachine／SubmissionService／VisibilityFilter／ResultService | `backend/src/domain/*.ts` | ✅ |
| Repository + SQLite | `backend/src/data/repositories.ts`、`db.ts` | ✅（已補 Repository） |
| DevAuthRouter／DevTeacherRouter／MockSeed | `backend/src/http/routes/devAuth.ts`、`devTeacher.ts`、`backend/src/data/mock/seed.ts` | ✅ |

**組裝與進入點**（不單獨列為組件）：`backend/src/server.ts`（組裝與啟動）、`http/app.ts`、`context.ts`、`domain/types.ts`、`frontend/src/main.tsx`、`App.tsx`（路由）、`styles/global.css`、`shared/src/index.ts`、`types.ts`。

**互動修正**：
- 原圖 `SubmissionService → Store`（每筆送出立即寫入）與實作不符。實作中，作答中的送出只存在記憶體，題目結束時由 `ResultService` 以單一交易寫入（research R4／R5、FR-020a）。
- 原圖 `VisibilityFilter → Store` 改為由組裝層讀取 Repository 後交給純函式 `buildView`。
- 補上 `ActivityStateMachine → Repository`（每次轉換保存階段）。

## 2. 類別圖：類別、屬性、方法、關聯

| 類別 | 程式位置 | 結果與修正 |
|------|----------|------------|
| Activity | `domain/types.ts` | ✅ 欄位改為 `id`、`endsAt: number`；方法移到 ActivityStateMachine |
| ActivityStateMachine + MachineHooks | `domain/activityStateMachine.ts` | ✅ 新增；方法 `open/timeUp/manualClose/closeQuestion/next/end/reset/recoverAfterRestart/status/dispose` 與程式一致（原圖的 `openQuestion`、`backToWaiting` 已移除） |
| Question／Team | `domain/types.ts` | ✅ 補上 `activityId` |
| Student | `domain/types.ts` | ✅ `teamId` 改為可為 null（未分組） |
| Submission | `domain/types.ts` | ✅ `receivedAt` 型別改為 epoch ms |
| QuestionResult | `domain/types.ts` | ✅ 欄位改為程式中的 camelCase（`questionId`、`winnerTeam`、`submittedAt`、`closedReason`、`closedAt`）；API 輸出的 snake_case 由 dev results 端點轉換 |
| SubmissionService | `domain/submissionService.ts` | ✅ `submit(student, …)` 拋出 AppError；補上 `startQuestion/clear/forTeam/all`；驗證改依賴 shared `AnswerRules` |
| VisibilityFilter + ViewInput | `domain/visibilityFilter.ts` | ✅ 簽章改為 `buildView(input: ViewInput)` |
| ResultService | `domain/resultService.ts` | ✅ `finalize(…, now)` |
| Repository | `data/repositories.ts` | ✅ 新增 |
| AppError／ErrorCode | `http/errors.ts`、`shared/src/errorCodes.ts` | ✅ 原 SubmitError 改為完整的 ErrorCode（15 個） |
| StudentView／TeamAnswer | `shared/src/types.ts` | ✅ 原 `myTeamSubmitted`、`myTeamAnswer` 改為 `myTeam`、`myTeamSubmission` |
| DevTeacherRouter | `http/routes/devTeacher.ts` | ✅ 原 MockTeacherControl 改為實際的路由與端點 |

## 3. 時序圖：參與者與呼叫順序

| 流程 | 結果與修正 |
|------|------------|
| 開啟頁面 | ✅ 改為 REST `GET /state` + socket 連線後立即推送 `state:update`（`useStudentState.ts`、`socketServer.ts`） |
| 開放題目 | ✅ `open → onQuestionOpened → saveActivity → setTimeout → onChange/pushAll`（`activityStateMachine.ts`、`server.ts`） |
| 送出答案 | ✅ `POST /submissions → submit（記憶體 Map）→ pushToTeam → 201`；原圖「原子寫入資料庫」已更正（`student.ts`、`submissionService.ts`） |
| 重複送出／結束後送出 | ✅ 由 AppError 經 StudentRouter 回 409 |
| 題目結束 | ✅ `closeQuestion → onQuestionClosed → ResultService.finalize（單一交易）→ saveActivity(CLOSED) → pushAll → 讀取已保存的送出` |
| 作答中重啟 | ✅ 改為啟動時 `recoverAfterRestart()`；送出只在記憶體，隨行程結束消失（`server.ts`） |
| 下一題／結束活動 | ✅ 方法名改為 `next()`、`end()` |

## 整合 001 後的再驗證（2026-11-23）

整合 001 的登入與組別後，三張圖已更新並重新產生 PNG，逐項確認與程式一致：

| 元素 | 對應程式 | 結果 |
|------|----------|------|
| AuthMiddleware（attachStudent／authenticateCookie） | `backend/src/http/middleware/auth.ts` | ✅ |
| RequireAuth + RequireRole、SessionService、UserRepository（001） | `backend/src/middleware/*`、`services/sessionService.ts`、`db/userRepository.ts` | ✅ |
| SocketServer：依學生目前組別產生視角 | `backend/src/realtime/socketServer.ts`（`pushWhere`） | ✅ |
| Repository：Team／Student 由 001 資料推導 | `backend/src/data/repositories.ts`（`getTeam`、`listTeams`、`getStudent`、`listStudents`） | ✅ |
| SQLite：001 與 002 資料表 | `backend/src/db/migrations.ts`（version 1、2） | ✅ |
| MockSeed：只寫活動與題目 | `backend/src/data/mock/seed.ts` | ✅ |
| LoginPage／StudentHome（001）→ StudentPage | `frontend/src/main.tsx`（`/student/buzzer`）、`pages/StudentHome.tsx` | ✅ |
| DevTeacherPanel 需老師登入 | `frontend/src/main.tsx`（`/dev`）、`backend/src/app.ts` | ✅ |
| 時序：REST 經 RequireAuth → attachStudent；handshake 帶 session cookie | `backend/src/app.ts`、`http/routes/student.ts`、`realtime/socketServer.ts` | ✅ |

已移除且不再出現在圖中：DevAuthRouter、DevLoginPage、JWT、teams／students 資料表。

## 驗證指令

```powershell
java -jar tools/plantuml.jar "./diagrams/*.puml"
```

```powershell
npm test
```
