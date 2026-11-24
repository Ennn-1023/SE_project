---

description: "Task list for 005 答案寫回 Google 試算表＋活動結果匯出 CSV（F10＋F11）"
---

# Tasks: 答案寫回 Google 試算表＋活動結果匯出 CSV（F10＋F11）

**Input**: Design documents from `/specs/005-sheets-writeback-csv-export/`

**Prerequisites**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、[data-model.md](data-model.md)、[contracts/](contracts/)、[quickstart.md](quickstart.md)

**Tests**: 需要。憲章原則 IV 要求每個功能有正常與邊界案例測試；測試檔案與涵蓋範圍依 [quickstart.md §2](quickstart.md) 與 research R15。每個故事先寫測試、確認失敗後再實作。

**Organization**: 依 spec 的使用者故事分階段（US1～US3 為 P1、US4 為 P2、US5 為 P3），每個故事可獨立實作與驗證。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行執行（不同檔案、不依賴未完成的任務）
- **[Story]**: 所屬使用者故事（US1～US5）
- 描述中均含確切檔案路徑；欄位約束以 `data-model.md` 的 `Entity.field` 引用，不重複抄寫

## Path Conventions

Monorepo：`shared/src/`、`backend/src/`、`backend/tests/`、`frontend/src/`、`frontend/tests/`（見 plan.md「Source Code」）。設計藍圖為 `diagrams/005-*.puml`（憲章原則 VI）。

---

## Phase 1: Setup（共用基礎）

**Purpose**: 共用型別、錯誤碼與測試輔助，供所有故事使用

- [ ] T001 [P] 在 `shared/src/resultExport.ts` 建立共用型別：`OverwriteMode`（data-model.md §5 `OverwriteMode`）、`WritebackItemStatus`（data-model.md §3.3 `WritebackItem.status`）、`SkipReason`（data-model.md §3.1 `WritebackPreview.skipped`）、API DTO `WritebackPreviewView`／`WritebackItemView`／`WritebackOutcomeView`（對應 `contracts/openapi.yaml`）、`CSV_HEADERS`（data-model.md §5 `CSV_HEADERS`）；並在 `shared/src/index.ts` 匯出
- [ ] T002 [P] 在 `backend/src/lib/errors.ts` 新增 9 個錯誤碼與其 HTTP 狀態、訊息、hint：`NO_ACTIVITY_RESULTS`、`WRITEBACK_NO_SOURCE`、`WRITEBACK_NOTHING_TO_WRITE`、`WRITEBACK_NOT_THIS_SHEET`、`WRITEBACK_PREVIEW_EXPIRED`、`WRITEBACK_STALE`、`WRITEBACK_IN_PROGRESS`、`WRITEBACK_OVERWRITE_REQUIRED`、`SHEET_PROTECTED_RANGE`（依 research R12 錯誤表）
- [ ] T003 [P] 擴充 `backend/tests/helpers/activity.ts`：可建立「含來源試算表與作答格後備位置」的活動，並能指定每題狀態（已結束／作答中／未開放）、參與組別、送出順位、各小題答案、作廢輪次；另提供「無來源（mock）活動」建立方式

---

## Phase 2: Foundational（阻擋性前置）

**Purpose**: 題目快照記錄寫回目標、紀錄表與共用結果讀取；寫回與 CSV 都依賴

**⚠️ CRITICAL**: 本階段完成前不可開始任何使用者故事

- [ ] T004 在 `backend/tests/unit/migrations.test.ts` 新增 v5 測試：新欄位存在、`activities` 來源欄位「全 NULL 或全非 NULL」CHECK、`question_parts.answer_cell` 格式約束、`export_events` 欄位與 CHECK、v4 → v5 既有活動資料保留且來源為 NULL
- [ ] T005 在 `backend/src/db/migrations.ts` 實作 migration version 5：`activities` 加 `spreadsheet_id`、`spreadsheet_title`、`sheet_id`、`sheet_title`、`source_url`（data-model.md §1.1 `activities.spreadsheet_id`、`activities.spreadsheet_title`、`activities.sheet_id`、`activities.sheet_title`、`activities.source_url`）；`question_parts` 加 `answer_cell`（data-model.md §1.2 `question_parts.answer_cell`）；新增 `export_events` 表與索引 `(activity_id, id)`（data-model.md §1.3 `export_events.id`、`export_events.at`、`export_events.actor_id`、`export_events.activity_id`、`export_events.type`、`export_events.spreadsheet_id`、`export_events.written`、`export_events.overwritten`、`export_events.skipped`、`export_events.rows`、`export_events.failure_code`）
- [ ] T006 在 `backend/src/domain/buzzerTypes.ts` 為 `Activity` 加入可為 null 的 `source`，並在 `backend/src/data/repositories.ts` 的 `createActivity` 寫入來源欄位與每個小題的 `answer_cell`（`NewActivityQuestion.parts` 加 `answerCell`；欄位約束依 data-model.md §1.1 `activities.*`、§1.2 `question_parts.answer_cell`）
- [ ] T007 先在 `backend/tests/integration/activity.start.test.ts` 新增測試（FR-005）：開始活動後 `activities` 記錄來源試算表五個欄位、每個小題記錄 `answer_cell`；開始後重新匯入或清除題目集，本場活動的寫回目標與後備位置不變；mock 活動來源為 NULL。再修改 `backend/src/services/activityService.ts` 的 `startActivity`，在建立題目快照的同一交易帶入 `record.set.source` 與 `slots[].answerCell`；確認 004 既有測試仍通過
- [ ] T008 [P] 建立 `backend/src/db/writebackTargetRepository.ts`：`getTarget(activityId)` 回傳 `WritebackTarget | null`、`getFallbacks(activityId)` 回傳 `AnswerSlotFallback[]`（`questionKey`＋`partIndex`＋`importedCell`，讀取 data-model.md §1.2 `question_parts.answer_cell`）；型別依 `diagrams/005-class.puml`
- [ ] T009 [P] 建立 `backend/src/db/exportEventRepository.ts`：`ExportEventType` 與 `record(event)`、`listByActivity(activityId)`，欄位與約束依 data-model.md §1.3 `export_events.type`、`export_events.written`、`export_events.overwritten`、`export_events.skipped`、`export_events.rows`、`export_events.failure_code`；介面不接受答案或試算表內容
- [ ] T010 [P] 在 `backend/tests/unit/activityResultReader.test.ts` 撰寫測試：`latestActivity()` 選最近開始的活動並排除 `started_at IS NULL`；`validResults()` 對作答中與未開放題目不帶任何送出（含舊輪次）、已結束題目排除作廢輪次、題組回傳各小題答案、`winner` 與目前輪次順位 1 一致、不讀出送出者
- [ ] T011 建立 `backend/src/services/activityResultReader.ts`：`latestActivity()` 與 `validResults(activityId)` 回傳 `QuestionOutcome[]`（結構與規則依 data-model.md §2 `QuestionOutcome.status`、`QuestionOutcome.teams`、`QuestionOutcome.submissions`、`QuestionOutcome.winner`）
- [ ] T012 建立 `backend/src/routes/resultExportRoutes.ts` 路由骨架（套用 `requireAuth`＋`requireRole(TEACHER)`），並在 `backend/src/context.ts` 組裝 `ActivityResultReader`、`WritebackTargetRepository`、`ExportEventRepository`，在 `backend/src/app.ts` 掛載於 `/api/teacher/activity`

**Checkpoint**: 活動開始會記錄寫回目標；結果讀取規則只有一份實作

---

## Phase 3: User Story 1 - 預覽並寫回搶答成功組別的答案 (Priority: P1) 🎯 MVP

**Goal**: 老師預覽每題搶答成功組別答案將寫入的作答格（依標註找出目前位置），確認後以單一批次、純文字寫入空白作答格

**Independent Test**: 單題範例 6 題：第 1～4 題由不同組成功、第 5 題無人送出、第 6 題未開放；預覽列出 4 筆與 2 筆不寫入原因；確認後第 1～4 題作答格出現成功組別答案，其他儲存格未被修改（spec US1 Independent Test）

### Tests for User Story 1 ⚠️

> 先寫測試並確認失敗，再實作

- [ ] T013 [P] [US1] 在 `shared/tests/resultExport.test.ts` 測試 `WritebackRules.validateOverwriteMode` 與 `WritebackRules.validateFallbackKeys`：允許值、`undefined`、非法值、非陣列、超過上限、格式不符、不屬於允許清單、重複
- [ ] T014 [P] [US1] 在 `backend/tests/unit/writebackService.test.ts`（以 `backend/tests/helpers/fakeGoogle.ts`）測試 `preview()`：全部 `EMPTY` 項目、題組各小題各自一項、插入列後依標註取得新位置、隱藏列標記 `hidden`、作廢輪次答案不出現、`NO_WINNER`／`NOT_OPENED` 列入不寫入清單、摘要計數；`confirm()`：只寫成功組別、單一 `writeCells` 呼叫、內容只有答案原文（不 trim、不加組名）、以 `=`／`+`／`-`／`@` 開頭的答案與含換行的 500 字答案原樣送出且 `valueInputOption` 為 `RAW`、合併的作答格寫入左上角格（FR-014）、回傳 `WritebackOutcome`、記錄 `WRITEBACK_SUCCEEDED` 事件且不含答案；預覽狀態為 `WRITING` 時再次確認不會再呼叫 `writeCells`
- [ ] T015 [P] [US1] 在 `backend/tests/integration/writeback.preview.test.ts` 撰寫 US1-1、US1-3、US1-4、US1-5 情境，以及學習單分頁改名後仍依分頁識別找到並顯示目前名稱（Edge Cases）
- [ ] T016 [P] [US1] 在 `backend/tests/integration/writeback.confirm.test.ts` 撰寫 US1-2（「已寫回 4 格（4 題）」與試算表連結）、US1-6（標註未被改動）與 SC-003（被修改格子僅限確認寫入的作答格）；輸入驗證（FR-024、憲章原則 I/II）：`previewId` 缺少或格式錯誤、`mode` 非允許值、body 多帶欄位（`.strict()`）皆回 400 `VALIDATION_ERROR` 並指出欄位，且未呼叫 Google 寫入
- [ ] T017 [P] [US1] 在 `backend/tests/integration/resultExport.auth.test.ts` 撰寫寫回端點的權限測試：學生 403 `FORBIDDEN`、未登入 401，回應不含結果資料、試算表未被修改（US1-7、SC-008）
- [ ] T018 [P] [US1] 在 `frontend/tests/WritebackPreviewDialog.test.tsx` 測試：載入中文案、目標試算表與分頁、摘要、項目卡片、不寫入題目清單、確認後顯示結果面板、答案以純文字呈現（含 `<b>` 等字串不被解析，FR-027）

### Implementation for User Story 1

- [ ] T019 [US1] 在 `shared/src/resultExport.ts` 實作 `WritebackRules`（`export const WritebackRules = { validateOverwriteMode, validateFallbackKeys }`），規則依 data-model.md §5 `WritebackRules.validateOverwriteMode`、`WritebackRules.validateFallbackKeys`
- [ ] T020 [US1] 建立 `backend/src/schemas/resultExport.ts` 的 `confirmBody`（zod `.strict()`），欄位依 data-model.md §6 `POST /writeback/confirm` 的 `previewId`、`mode`、`fallbackKeys` 與 `contracts/openapi.yaml` `ConfirmBody`
- [ ] T021 [US1] 建立 `backend/src/services/writebackService.ts` 的 `preview(teacherId)` 與 `resolveItems(activityId, sheet)`：讀取寫回目標 → `SheetsService.readSheet` → `AnnotationCodec.decode` → 依 research R5 判定 `EMPTY`／`OVERWRITE`／`SAME_CONTENT`；預覽存於記憶體 `Map`，每位老師只保留最新一份（data-model.md §3.1 `WritebackPreview.previewId`、`WritebackPreview.teacherId`、`WritebackPreview.createdAt`、`WritebackPreview.resultFingerprint`、`WritebackPreview.skipped`、`WritebackPreview.summary`；§3.2 `WritebackItem.key`、`WritebackItem.cell`、`WritebackItem.hidden`、`WritebackItem.currentContent`、`WritebackItem.status`）
- [ ] T022 [US1] 在 `backend/src/services/writebackService.ts` 實作 `confirm(teacherId, previewId, mode, fallbackKeys)` 基本流程：查預覽與過期檢查（`WRITEBACK_PREVIEW_EXPIRED`）、在第一個 `await` 之前同步檢查並設定 `state`（`READY` → `WRITING`，非 `READY` 時不再寫入；data-model.md §3.1 `WritebackPreview.state`），讓 MVP 階段連點也只寫一次、組出 `updates` 並呼叫 `SheetsService.writeCells`（RAW、單一批次）、回傳 `WritebackOutcome`（data-model.md §3.4）、記錄 `ExportEvent`
- [ ] T023 [US1] 在 `backend/src/routes/resultExportRoutes.ts` 加入 `POST /writeback/preview` 與 `POST /writeback/confirm`（`validate(confirmBody)`），並在 `backend/src/context.ts` 組裝 `WritebackService`（注入 `SheetsService`、`AnnotationCodec`、`ActivityResultReader`、兩個 repository）
- [ ] T024 [P] [US1] 在 `frontend/src/api/apiClient.ts` 新增 `writebackPreview()` 與 `writebackConfirm(body)`
- [ ] T025 [US1] 建立 `frontend/src/activity/WritebackPreviewDialog.tsx`：手機全螢幕／桌機置中（最大寬 960px）、載入、目標、摘要、項目卡片、不寫入清單、「取消」與「確認寫回」（珊瑚橘）、寫入中不可關閉；所有內容為 React 文字節點＋`whitespace-pre-wrap break-words`（`contracts/ui-routes.md`）
- [ ] T026 [P] [US1] 建立 `frontend/src/activity/WritebackResultPanel.tsx`：已寫回格數與題數、「開啟試算表」（新分頁）、「關閉」
- [ ] T027 [US1] 在 `frontend/src/pages/ActivityControlPage.tsx` 頂部工具列加入「寫回 Google 試算表」入口並開啟對話框，同步更新 `frontend/tests/ActivityControlPage.test.tsx`

**Checkpoint**: 全空白作答格的寫回可端到端完成並獨立驗證

---

## Phase 4: User Story 2 - 作答格已有內容時的覆蓋確認 (Priority: P1)

**Goal**: 已有內容的作答格醒目標示，老師須選「全部覆蓋」或「略過已有內容」；相同內容不重複寫入；預覽後有變動時整批不寫

**Independent Test**: 第 1 題作答格預填「老師筆記」、第 2 題預填相同答案；預覽分別標示將覆蓋與相同內容；選「略過已有內容」後第 1 題不變、其他空白格寫入（spec US2 Independent Test）

### Tests for User Story 2 ⚠️

- [ ] T028 [P] [US2] 在 `backend/tests/unit/writebackService.test.ts` 新增：trim 後空白視為 `EMPTY`、trim 後相同為 `SAME_CONTENT` 且不寫、有 `OVERWRITE` 未給 `mode` → `WRITEBACK_OVERWRITE_REQUIRED`、`SKIP_NON_EMPTY` 與 `OVERWRITE_ALL` 的寫入與計數、預覽後內容變動或結果指紋變動 → `WRITEBACK_STALE`（訊息含題號）且未呼叫 `writeCells`
- [ ] T029 [P] [US2] 在 `backend/tests/integration/writeback.confirm.test.ts` 新增 US2-1～US2-6 與 SC-004
- [ ] T030 [P] [US2] 在 `frontend/tests/WritebackPreviewDialog.test.tsx` 新增：有將覆蓋項目時覆蓋選項必選、未選時「確認寫回」停用、將覆蓋卡片顯示目前內容、`WRITEBACK_STALE` 顯示變動題號與「重新預覽」、`WRITEBACK_PREVIEW_EXPIRED` 顯示「重新預覽」

### Implementation for User Story 2

- [ ] T031 [US2] 在 `backend/src/services/writebackService.ts` 實作依 `mode` 篩選（data-model.md §3.3 狀態表）、`WRITEBACK_OVERWRITE_REQUIRED`，以及 `recheck(preview)`：重新 `readSheet`＋`decode`＋`validResults`，比對每項 `(status, cell, currentContent)` 與 `WritebackPreview.resultFingerprint`；不同時回覆 `WRITEBACK_STALE` 並讓預覽失效
- [ ] T032 [US2] 在 `frontend/src/activity/WritebackPreviewDialog.tsx` 加入覆蓋選項 radio（全部覆蓋／略過已有內容的格子，只寫入空白格）、將覆蓋卡片珊瑚橘邊框、相同內容徽章、STALE 與 EXPIRED 狀態的「重新預覽」
- [ ] T033 [US2] 在 `frontend/src/activity/WritebackResultPanel.tsx` 顯示覆蓋格數與略過格數及原因（`WritebackOutcome.skippedReasons`，data-model.md §3.4）

**Checkpoint**: US1＋US2 合起來即為完整、安全的寫回流程

---

## Phase 5: User Story 3 - 匯出活動結果 CSV (Priority: P1)

**Goal**: 下載最近一場活動每題每組每小題一列的 CSV，Excel 中文不亂碼、正確跳脫、`=`／`@` 開頭防公式注入，不含學生個資

**Independent Test**: 3 組、2 題（含題組）的活動，答案含逗號、換行、`"`、`=1+1`、`-5 度`；匯出後內容、列數、跳脫與前綴皆正確（spec US3 Independent Test）

### Tests for User Story 3 ⚠️

- [ ] T034 [P] [US3] 在 `backend/tests/unit/csvEncoder.test.ts` 以表格式測試：BOM、CRLF、逗號／雙引號／CR／LF 包覆與 `""` 跳脫、`=`／`@` 開頭加 `'`、`+`／`-`／Tab／CR 開頭不加、先防注入再跳脫、中文、500 字含換行的答案、組名含逗號或以 `=` 開頭（Edge Cases）
- [ ] T035 [P] [US3] 在 `backend/tests/integration/export.csv.test.ts` 撰寫 US3-1～US3-7a：標題列、`Content-Type`、`Content-Disposition`（`filename*` 為 `搶答結果_YYYYMMDD-HHmm.csv`）、依順位排序、題組每組每小題一列、未送出列、未開放題一列、送出時間精確到 0.1 秒、SC-007 列數公式、不含學生姓名／學號／帳號、記錄 `CSV_EXPORTED` 事件
- [ ] T036 [P] [US3] 在 `backend/tests/integration/resultExport.auth.test.ts` 新增 `GET /export.csv` 的學生 403、未登入 401，回應不含 CSV 內容（US3-8）
- [ ] T037 [P] [US3] 在 `frontend/tests/ExportCsvButton.test.tsx` 測試：閒置、「匯出中…」停用、成功時建立 Blob 並觸發 `<a download>`、失敗時以 `role="alert"` 顯示 message＋hint

### Implementation for User Story 3

- [ ] T038 [P] [US3] 建立 `backend/src/services/csvEncoder.ts`（`export const CsvEncoder = { encode, escapeField, neutralizeFormula }`，純函式，規則依 research R10 與 `contracts/csv-format.md`）
- [ ] T039 [US3] 建立 `backend/src/services/csvExportService.ts`：`CsvQuestionStatus`、`CsvResultRow`、`buildRows(outcomes)` 與 `export(teacherId)`；每列欄位、排序與列數依 data-model.md §4 `CsvResultRow.題號`、`CsvResultRow.小題`、`CsvResultRow.題目狀態`、`CsvResultRow.組別`、`CsvResultRow.搶答順位`、`CsvResultRow.是否搶答成功`、`CsvResultRow.送出時間（秒）`、`CsvResultRow.答案`；檔名依 FR-022；送出前記錄 `ExportEvent(CSV_EXPORTED)`（data-model.md §1.3 `export_events.rows`）
- [ ] T040 [US3] 在 `backend/src/routes/resultExportRoutes.ts` 加入 `GET /export.csv`（設定 `Content-Type`、`Content-Disposition` 後 `res.send`，research R11），並在 `backend/src/context.ts` 組裝 `CsvExportService`
- [ ] T041 [P] [US3] 在 `frontend/src/api/apiClient.ts` 新增 `downloadResultsCsv()`：`fetch` → `ok` 時 `blob()`＋`URL.createObjectURL`＋暫時 `<a download>`＋`revokeObjectURL`；否則解析 `ErrorResponse`
- [ ] T042 [US3] 建立 `frontend/src/activity/ExportCsvButton.tsx`（深藍撞色、觸控區 ≥ 44px）並加入 `frontend/src/pages/ActivityControlPage.tsx` 頂部工具列

**Checkpoint**: CSV 匯出可獨立於 Google 帳號使用

---

## Phase 6: User Story 4 - 寫回與匯出的入口、時機與錯誤處理 (Priority: P2)

**Goal**: 活動任何階段都可使用、只含已結束題目；Google 錯誤清楚回覆且不部分寫入；重複確認只寫一次

**Independent Test**: 第 3 題作答中時預覽與 CSV 只含第 1、2 題；撤銷 Google 授權後寫回顯示重新連結訊息，CSV 仍可匯出（spec US4 Independent Test）

### Tests for User Story 4 ⚠️

- [ ] T043 [P] [US4] 在 `backend/tests/integration/writeback.preview.test.ts` 新增 US4-1～US4-4、US4-6：作答中題目列為 `ANSWERING`、無活動 `NO_ACTIVITY_RESULTS`、無成功組別 `WRITEBACK_NOTHING_TO_WRITE`（未呼叫 Google 寫入）、無來源活動 `WRITEBACK_NO_SOURCE`、`GOOGLE_NOT_CONNECTED`／`GOOGLE_AUTH_EXPIRED`、`SHEET_NOT_FOUND`、`SHEET_TAB_NOT_FOUND`
- [ ] T044 [P] [US4] 在 `backend/tests/integration/writeback.confirm.test.ts` 新增 US4-5、US4-7～US4-9：無編輯權限、受保護範圍、逾時／超過上限皆未寫入任何格子且記錄 `WRITEBACK_FAILED`；連續確認與並行確認只呼叫一次 `writeCells`（另一個得到 `WRITEBACK_IN_PROGRESS` 或同一份結果）；重新開放後再次寫回顯示將覆蓋舊答案
- [ ] T045 [P] [US4] 在 `backend/tests/unit/googleHttp.test.ts` 新增：寫入階段 403 且訊息含 `protected` → `SHEET_PROTECTED_RANGE`；不含時維持 `SHEET_NO_EDIT_PERMISSION`；讀取階段不受影響
- [ ] T046 [P] [US4] 在 `backend/tests/integration/export.csv.test.ts` 新增：作答中題目一列且不含任何送出（含作廢舊輪次）、無活動 `NO_ACTIVITY_RESULTS`、Google 未連結時仍可匯出（FR-023）、無成功組別時仍輸出未送出列
- [ ] T047 [P] [US4] 在 `frontend/tests/ActivityControlPage.test.tsx` 與 `frontend/tests/WritebackPreviewDialog.test.tsx` 新增：無活動時兩個入口停用並顯示「尚無搶答活動結果可寫回或匯出」、活動結束摘要顯示兩個按鈕、Google 授權錯誤顯示「前往連結 Google 帳號」導向 `/teacher/questions`

### Implementation for User Story 4

- [ ] T048 [P] [US4] 修改 `backend/src/integrations/google/googleHttp.ts` 的 `mapGoogleError`：寫入階段 403 且 Google 訊息含 `protected` 時回傳 `SHEET_PROTECTED_RANGE`（research R7）
- [ ] T049 [US4] 在 `backend/src/services/writebackService.ts` 完成冪等與錯誤處理：在 T022 的同步檢查中加入全域旗標（不同預覽也不可並行寫回）、`WRITING` → `WRITEBACK_IN_PROGRESS`、`DONE` → 回傳快取 `WritebackPreview.outcome`、失敗回到 `READY`、`finally` 清旗標；`NO_ACTIVITY_RESULTS`、`WRITEBACK_NO_SOURCE`、`WRITEBACK_NOTHING_TO_WRITE`；失敗記錄 `WRITEBACK_FAILED` 與 data-model.md §1.3 `export_events.failure_code`；錯誤訊息不含 token 與內部細節（research R8）
- [ ] T050 [US4] 在 `frontend/src/activity/ActivitySummary.tsx` 加入「寫回 Google 試算表」「匯出結果 CSV」醒目按鈕，並在 `frontend/src/pages/ActivityControlPage.tsx` 依 `NONE` 階段停用入口與顯示說明
- [ ] T051 [US4] 在 `frontend/src/activity/WritebackPreviewDialog.tsx` 加入錯誤狀態：顯示 message＋hint；`GOOGLE_NOT_CONNECTED`／`GOOGLE_AUTH_EXPIRED` 顯示「前往連結 Google 帳號」；不寫入清單顯示「作答中，結束後才可寫回」

**Checkpoint**: 所有入口、時機與 Google 錯誤情境都有清楚回覆

---

## Phase 7: User Story 5 - 找不到標註時的處理 (Priority: P3)

**Goal**: 找不到標註的作答格預設不寫入、可逐項勾選寫入匯入時位置；標註重複者略過；全部找不到時提示可能不是本場學習單

**Independent Test**: 移除第 3 題作答格標註後預覽，第 3 題顯示「找不到作答格標註（匯入時位置：G9）」且預設不寫入；勾選後確認寫入 G9（spec US5 Independent Test）

### Tests for User Story 5 ⚠️

- [ ] T052 [P] [US5] 在 `backend/tests/unit/writebackService.test.ts` 新增：`RESTORED_CELL_MISSING` → `ANNOTATION_MISSING`（附後備位置與其目前內容）、未勾選略過並計入「找不到標註」、勾選寫入後備格且後備格非空時依 `mode` 判斷、`RESTORED_CONFLICT` → `ANNOTATION_DUPLICATED` 一律略過、全部找不到 → `WRITEBACK_NOT_THIS_SHEET`、`fallbackKeys` 含非 `ANNOTATION_MISSING` 項目 → `VALIDATION_ERROR`
- [ ] T053 [P] [US5] 在 `backend/tests/integration/writeback.preview.test.ts` 新增 US5-1、US5-3、US5-4，在 `backend/tests/integration/writeback.confirm.test.ts` 新增 US5-2
- [ ] T054 [P] [US5] 在 `frontend/tests/WritebackPreviewDialog.test.tsx` 新增：找不到標註卡片的核取方塊預設不勾、勾選後送出的 `fallbackKeys`、標註重複卡片文案、`WRITEBACK_NOT_THIS_SHEET` 顯示學習單名稱與連結

### Implementation for User Story 5

- [ ] T055 [US5] 在 `backend/src/services/writebackService.ts` 的 `resolveItems` 依 `decode` 警告產生 `ANNOTATION_MISSING`／`ANNOTATION_DUPLICATED`（data-model.md §3.2 `WritebackItem.fallbackCell`、`WritebackItem.status`；§3.3 狀態表），`confirm` 以 `WritebackRules.validateFallbackKeys` 驗證勾選並只寫入勾選的後備格，全部找不到時回覆 `WRITEBACK_NOT_THIS_SHEET`（research R3）
- [ ] T056 [US5] 在 `frontend/src/activity/WritebackPreviewDialog.tsx` 加入找不到標註卡片（匯入時位置、目前內容、「寫入匯入時的位置」核取方塊）、標註重複卡片，以及 `WRITEBACK_NOT_THIS_SHEET` 錯誤畫面

**Checkpoint**: 所有使用者故事可獨立運作

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事的設計一致性、版面、隱私、效能與驗證回報

- [ ] T057 擴充 `backend/tests/architecture/diagram-consistency.test.ts` 加入 005：組件圖元件對應檔案存在、類別圖公開方法存在、時序圖端點已掛載（plan.md「設計圖對照表」，憲章原則 VI）
- [ ] T058 [P] 擴充 `frontend/tests/narrowScreen.test.tsx`：375px 下 `WritebackPreviewDialog`、`WritebackResultPanel`、`ExportCsvButton` 無水平捲動、按鈕觸控區 ≥ 44px（SC-010）
- [ ] T059 [P] 在 `backend/tests/unit/writebackService.test.ts` 與 `backend/tests/integration/export.csv.test.ts` 新增隱私檢查：`export_events` 列與 logger 輸出不含答案文字、token、試算表內容（FR-025、憲章原則 III）
- [ ] T060 [P] 在 `backend/tests/unit/writebackService.test.ts` 與 `backend/tests/integration/export.csv.test.ts` 新增效能測試：10 組 × 200 題 × 10 小題的合成資料，預覽與匯出各在 10 秒內完成，且寫回只呼叫一次 `writeCells`（SC-009）
- [ ] T061 執行 `npm test`、`npm run typecheck`、`npm run lint`，依 `specs/005-sheets-writeback-csv-export/quickstart.md` §4 格式回報實際指令與結果（憲章原則 V）
- [ ] T062 依 `specs/005-sheets-writeback-csv-export/quickstart.md` §3 走過手動驗證情境 3.1～3.8，並記錄結果

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：無相依，可立即開始
- **Foundational（Phase 2）**：依賴 Setup；阻擋所有使用者故事
- **US1～US5（Phase 3～7）**：皆依賴 Foundational
- **Polish（Phase 8）**：依賴所需故事完成

### User Story Dependencies

- **US1（P1）**：Foundational 後即可開始，不依賴其他故事
- **US2（P1）**：依賴 US1 的 `writebackService.ts` 與對話框（同檔擴充）
- **US3（P1）**：Foundational 後即可開始，**與 US1／US2 互相獨立**（只共用 `resultExportRoutes.ts`、`context.ts`、`apiClient.ts`、`ActivityControlPage.tsx`，需依序編輯這幾個檔案）
- **US4（P2）**：寫回部分依賴 US1（＋US2 的 recheck）；CSV 部分依賴 US3
- **US5（P3）**：依賴 US1（`resolveItems`、`confirm`、對話框）

```text
Setup → Foundational ─┬─ US1 → US2 ─┬─ US4 ─┐
                      │             └─ US5 ─┼─ Polish
                      └─ US3 ───────────────┘
```

### Within Each User Story

- 測試先寫並確認失敗
- shared 規則與 schema → service → 路由／組裝 → 前端 API → 元件 → 頁面整合
- 同一檔案的任務依序執行（如 `writebackService.ts`：T021 → T022 → T031 → T049 → T055）

### Parallel Opportunities

- Phase 1：T001、T002、T003 全部可平行
- Phase 2：T008、T009、T010 可平行（T005 完成後）；T004 與 T010 可平行撰寫
- US1：測試 T013～T018 全部可平行；T024、T026 可與後端實作平行
- US2：T028～T030 可平行
- US3：T034～T037 可平行；T038 與 T041 可平行；整個 US3 可與 US1／US2 由不同人平行進行
- US4：T043～T047 可平行；T048 可與 T049 平行
- US5：T052～T054 可平行
- Polish：T058、T059、T060 可平行

---

## Parallel Example: User Story 1

```bash
# 同時撰寫 US1 的所有測試：
Task: "WritebackRules 測試 in shared/tests/resultExport.test.ts"
Task: "WritebackService preview/confirm 單元測試 in backend/tests/unit/writebackService.test.ts"
Task: "寫回預覽整合測試 in backend/tests/integration/writeback.preview.test.ts"
Task: "確認寫回整合測試 in backend/tests/integration/writeback.confirm.test.ts"
Task: "權限測試 in backend/tests/integration/resultExport.auth.test.ts"
Task: "對話框測試 in frontend/tests/WritebackPreviewDialog.test.tsx"

# 後端實作進行時，同時做前端：
Task: "writebackPreview/writebackConfirm in frontend/src/api/apiClient.ts"
Task: "WritebackResultPanel in frontend/src/activity/WritebackResultPanel.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "CsvEncoder 表格式測試 in backend/tests/unit/csvEncoder.test.ts"
Task: "CSV 匯出整合測試 in backend/tests/integration/export.csv.test.ts"
Task: "ExportCsvButton 測試 in frontend/tests/ExportCsvButton.test.tsx"
Task: "CsvEncoder in backend/src/services/csvEncoder.ts"
```

---

## Implementation Strategy

### MVP First（User Story 1）

1. 完成 Phase 1 Setup 與 Phase 2 Foundational
2. 完成 Phase 3（US1）：空白作答格可端到端寫回
3. **停下驗證**：以 quickstart §3.1 的單題範例（作答格全空白）確認寫回結果
4. 由於 US1 尚未處理覆蓋確認，實際 Demo 建議連同 US2 一起交付
5. US1 已在 T022 以同步檢查 `state` 防止同一份預覽重複寫入；「不同預覽並行寫回」的全域旗標、`WRITEBACK_IN_PROGRESS` 回覆與快取結果在 US4（T049）完成

### Incremental Delivery

1. Setup＋Foundational → 活動快照記錄寫回目標
2. US1＋US2 → 安全的寫回流程（M4 Demo 核心）
3. US3 → CSV 匯出（可與 US1／US2 平行）
4. US4 → 入口、時機與錯誤處理
5. US5 → 找不到標註的容錯
6. Polish → 設計圖一致性、窄螢幕、隱私、效能、測試回報

### Parallel Team Strategy

1. 全員完成 Setup＋Foundational
2. 之後：
   - 開發者 A：US1 → US2 → US5
   - 開發者 B：US3 → US4（CSV 部分）
   - US4 寫回部分待 US2 完成後進行

---

## Notes

- [P] = 不同檔案、無未完成的相依
- [Story] 標籤對應 spec 的使用者故事，便於追溯
- 欄位約束一律以 data-model.md 為準；任務中只引用，不重複抄寫
- 每完成一個任務或邏輯群組即可 commit（使用者要求時）
- 偏離 `diagrams/005-*.puml` 時，先改圖並重新產生 PNG，再改程式（憲章原則 VI）
