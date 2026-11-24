# 設計圖一致性驗證（T076、T077，憲章原則 VI）

**日期**：2026-11-24 | **Plan**：[plan.md](plan.md)

## 1. 組件圖與類別圖（自動化，T076）

`backend/tests/architecture/diagram-consistency.test.ts` 已擴充為同時讀取 001、003、004 的 plan 與圖：

- 004 組件圖 34 個組件皆在 plan.md 對照表中有檔案並匯出同名符號（`VisibilityFilter` 以 `visibilityFilter`、`SocketServer` 以型別、`StudentRoutes` 以 `studentRoutes` 匯出；hook 以中文名稱對應）。
- 004 類別圖的類別、列舉、DTO 皆在對照檔案中匯出；`ActivityStateMachine`、`ActivityService`、`MonitorViewBuilder`、`ActivityLockGuard`、`SubmissionService`、`ResultService` 的公開方法與類別圖完全一致；`ActivityRules` 的方法以同名匯出函式實作；實體與 DTO 的主要屬性皆存在。
- `routes／services／db／middleware／integrations` 下沒有 001＋003＋004 對照表與允許清單以外的檔案。

結果：`npm run test -w backend -- tests/architecture/diagram-consistency` → 243 passed。

## 2. 時序圖逐步比對（手動，T077）

| 時序圖 | 比對結果 | 處理 |
|---|---|---|
| 004-sequence-question：開放 | `ActivityRoutes（requireAuth＋TEACHER）→ ActivityService.openQuestion → ActivityStateMachine.open（validateSeconds → 階段與題目狀態檢查 → updateQuestionState → onQuestionOpened → saveActivity → setTimeout → onChange）`，事件 `QUESTION_OPENED` 只在輪次實際改變時寫入 | 原圖把秒數驗證畫在 ActivityService、參與組別畫在狀態機；實作中秒數由狀態機驗證、參與組別與 `startQuestion` 由 ActivityService 註冊的 `onQuestionOpened` hook 處理 → 已更新圖 |
| 同上：即時監控 | `StudentRoutes → SubmissionService.submit（validatePartAnswers → 階段檢查 → 記憶體 Map）→ pushToTeam → pushTeachers → MonitorViewBuilder.build` 相同 | 圖上標明推播由 StudentRoutes 觸發 |
| 同上：時間到／手動結束 | 計時器或 `manualClose → closeQuestion`（非 ANSWERING 回 false）→ `onQuestionClosed` hook → `ResultService.finalize`（作廢舊輪＋寫入本輪，單一交易）→ `QUESTION_CLOSED` 事件（時間到與連帶結束 actor 為 null）→ 題目與活動改為 CLOSED → 推播 | 原圖缺事件寫入與 hook 所在位置 → 已補上 |
| 同上：直接開放下一題、重新開放、回到等待 | `open` 允許 CLOSED 起始；`reopenQuestion` 先檢查 `confirm` 再 `reopen`，新一輪結束時才作廢舊輪；`backToWaiting` 相同 | 重開時 `startQuestion` 改為經由 hook → 已更新圖 |
| 004-sequence-lifecycle：開始活動 | `ActivityService.startActivity`：`Repository.hasRunningActivity → QuestionSetRepository.findCurrent → Repository.memberCounts → createActivity（交易）→ machine.start → STARTED 事件` | 原圖畫成呼叫 QuestionSetService 與 GroupService；實作直接讀取 repository（服務層只需唯讀查詢，避免與鎖定規則互相依賴）→ 已更新時序圖與組件圖的連線 |
| 同上：鎖定題目集 | `QuestionSetService.clear／reimport`、`QuestionImportService.confirm` 第一行呼叫 `ActivityLockGuard.assertQuestionSetMutable`；`GroupService.assign／selfSelect／setGroupCount` 呼叫 `assertGroupChangeAllowed` | 組件圖原本畫成 Routes → Lock，改為 Service → Lock |
| 同上：重新整理恢復、結束活動 | `GET /api/teacher/activity` 與 `/teacher` 連線即送 `teacher:update`；`endActivity → machine.end（作答中先 closeQuestion(ACTIVITY_ENDED)）→ ENDED 事件` 相同 | 無 |

以上偏離皆為呼叫位置的細節，未改變架構；已先修改 `.puml`，再執行 `java -jar plantuml.jar "./diagrams/*.puml"` 重新產生 PNG（`.puml` 與 PNG 時間戳記已確認同步）。

## 3. 實作期間的設計補充（已同步至文件）

| 項目 | 原設計 | 實作 | 更新的文件 |
|---|---|---|---|
| 題目清單內容 | 只有摘要 | 加上 `stem`、`parts`，讓老師開放前能預覽完整題目（US2-1） | data-model §3、openapi `QuestionListItem` |
| `SubmissionService.startQuestion` | `(questionId, round, partCount)` | `(questionId, round, parts)`：需要小題標籤才能回傳「第（2）小題…」 | 類別圖、時序圖 |
| `ActivityStateMachine.clearNotice` | 無 | 老師下一次操作後清除重啟提示 | 類別圖 |
| 啟動時 mock 活動 | 自動 seed | 改由 `POST /api/dev/teacher/mock-activity`（只在開發模式）或測試 helper 建立 | research R2、plan |
| 組件標籤 | `StudentRoutes（002）` 等 | 英文識別名獨立成一行，供一致性測試解析 | 組件圖、plan 對照表 |
