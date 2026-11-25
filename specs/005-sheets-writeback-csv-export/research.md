# Research: 答案寫回 Google 試算表＋活動結果匯出 CSV（F10＋F11）

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-24

本文件記錄 Phase 0 的設計決策。Technical Context 沒有 NEEDS CLARIFICATION 項目（技術棧沿用 001～004）；以下決策處理規格中「如何做」的未知點。

---

## R1. 設計圖為藍圖（憲章原則 VI）

- **Decision**: 以 `diagrams/005-component.puml`、`005-class.puml`、`005-sequence-writeback.puml`、`005-sequence-export.puml` 為藍圖。plan 階段因 R3 的決策（改用 `readSheet`＋`AnnotationCodec.decode` 取代 `locateAnswerCells`）同步更新組件圖、類別圖與寫回時序圖，並重新產生 PNG。`backend/tests/architecture/diagram-consistency.test.ts` 擴充至 005。
- **Rationale**: 憲章要求 plan 偏離圖表時先改圖再改 plan。
- **Alternatives considered**: 保留 `locateAnswerCells` 呼叫 → 它只回傳「找得到」的作答格，無法區分「找不到標註」與「標註重複」（FR-010），否決。

## R2. 寫回目標與後備位置的保存方式

- **Decision**: migration **version 5**：
  - `activities` 新增 `spreadsheet_id`、`spreadsheet_title`、`sheet_id`、`sheet_title`、`source_url`（皆可為 NULL：002 的 mock 活動或 v5 前已開始的活動沒有來源）。
  - `question_parts` 新增 `answer_cell`（匯入當下作答格位置，可為 NULL）。
  - `ActivityService.startActivity` 在建立題目快照時一併寫入（`record.set.source` 與 `slots[].answerCell`）。
- **Rationale**: FR-005 要求本場活動開始後重新匯入題目集不影響寫回目標；題目快照本來就在 `startActivity` 的同一個交易建立，加欄位即可，不需新表。
- **Alternatives considered**: 寫回時讀 `question_sets`（目前題目集）→ 活動結束後老師可能已重新匯入別份學習單，違反 FR-005，否決。另建 `writeback_targets` 表 → 與 `activities` 一對一，徒增 join，否決；類別圖的 `WritebackTarget`／`AnswerSlotFallback` 以 `WritebackTargetRepository` 讀取這些欄位呈現。
- **無來源的活動**：寫回回覆 `WRITEBACK_NO_SOURCE`「本場活動沒有記錄來源試算表，無法寫回」（含 v5 前開始的活動與非匯入題目的活動）；CSV 不受影響。

## R3. 依標註定位作答格（找不到／重複）

- **Decision**: `WritebackService` 呼叫 `SheetsService.readSheet()` 一次取得 `grid`（目前內容、合併格、隱藏列欄）與 `metadata`，再以 003 的 `AnnotationCodec.decode()` 還原每題每小題的作答格：
  - 有位置 → `EMPTY`／`OVERWRITE`／`SAME_CONTENT`（依 R5 比對）。
  - `decode` 警告 `RESTORED_CELL_MISSING`（含 `questionKey`、`partIndex`），或題目 key 不在 `qimport.set` 中 → `ANNOTATION_MISSING`，附 `fallbackCell`（R2）。
  - `decode` 警告 `RESTORED_CONFLICT`（兩個角色落在同一格）涉及該作答格 → `ANNOTATION_DUPLICATED`，一律略過（FR-010）。
  - 本場所有作答格皆 `ANNOTATION_MISSING` → 回覆 `WRITEBACK_NOT_THIS_SHEET`（US5-4），附學習單名稱與連結。
- **Rationale**: 一次讀取同時取得位置與內容（R5、R6 也需要），呼叫 Google 次數最少；重用 003 已測試的解碼邏輯，不重寫標註格式。
- **Alternatives considered**: 擴充 `SheetsService.locateAnswerCells` 回傳狀態 → 仍需另外讀一次格子內容，否決。
- **標註模型備註**：003 的標註為「列 metadata × 欄錨點」，複製貼上整列不會複製 developer metadata；因此「重複」實務上表現為多個角色落在同一格（conflict），對應規格 US5-3。

## R4. 預覽的保存與有效期限

- **Decision**: 預覽只存在 `WritebackService` 的記憶體 `Map<previewId, PreviewEntry>`；每位老師同時只保留最新一份（新預覽取代舊的），有效 15 分鐘。`previewId` 為 `randomBytes(9).toString('base64url')`。過期、被取代或伺服器重啟後確認 → `WRITEBACK_PREVIEW_EXPIRED`「預覽已失效，請重新預覽」。
- **Rationale**: 系統只有一位老師（001）；預覽是短期操作狀態，不需持久化；重啟後重新預覽是安全的（寫入前本來就要重新比對）。
- **Alternatives considered**: 存資料庫 → 需要清理機制且沒有使用者價值，否決。不保存、確認時重新計算 → 無法偵測「預覽後有變動」（FR-012），否決。

## R5. 「已有內容」「相同內容」與預覽後變動的判定

- **Decision**:
  - 目前內容取 `grid.cells[ref].text`（Google 的顯示值）；不在 `cells` 中視為空白。
  - `trim()` 後為空 → `EMPTY`；`trim()` 後與答案 `trim()` 完全相同 → `SAME_CONTENT`；其餘 → `OVERWRITE`。
  - 預覽保存每個目標的 `(cell, currentText)` 與本場結果指紋（每題 `questionId:round:winnerTeam` 排序後的 SHA-256）。
  - 確認時重新 `readSheet` + `decode`，任一項目位置或內容不同，或結果指紋不同（題目在預覽後被重新開放／結束）→ `WRITEBACK_STALE`（409），訊息列出變動的題號，不寫入任何格子。
- **Rationale**: 對應 FR-011、FR-012 與 US2-5；結果指紋避免把預覽後已作廢的答案寫回（FR-007）。
- **Alternatives considered**: 以 Google Sheets 修訂版本號比對 → Sheets API 不提供儲存格層級的版本，否決。

## R6. 單一批次寫入與純文字

- **Decision**: 沿用 003 `SheetsService.writeCells()` → `SheetsGateway.updateValues()`（`values:batchUpdate`、`valueInputOption: RAW`）一次送出所有格子。`RAW` 讓 `=`、`+`、`-`、`@` 開頭的答案原樣存為文字，不被解析為公式、數字或日期（FR-014）；換行原樣保留。合併格寫入 `decode` 回傳的左上角格。
- **Rationale**: `values:batchUpdate` 為單一請求；Google 在請求驗證失敗（無權限、受保護範圍、範圍不存在）時整批拒絕，符合 FR-013 的全有或全無。
- **Alternatives considered**: 每格一個請求 → 可能部分成功且觸發配額，否決。`USER_ENTERED` → 會把答案當公式，否決。
- **殘餘風險**：網路在請求送出後中斷時，伺服器無法得知 Google 是否已套用；此時回覆 `GOOGLE_UNAVAILABLE`，老師重試時預覽會顯示「已是相同內容」，不會重複寫入（R5）。

## R7. Google 錯誤對應

- **Decision**: 沿用 003 `mapGoogleError` 的碼（`GOOGLE_NOT_CONNECTED`、`GOOGLE_AUTH_EXPIRED`、`SHEET_NO_EDIT_PERMISSION`、`SHEET_NOT_FOUND`、`SHEET_TAB_NOT_FOUND`、`GOOGLE_RATE_LIMITED`、`GOOGLE_UNAVAILABLE`）。新增 `SHEET_PROTECTED_RANGE`：寫入階段 403 且 Google 錯誤訊息含 `protected` 時使用；無法判斷時退回 `SHEET_NO_EDIT_PERMISSION`（兩者處理方式都是請擁有者調整權限）。
- **Rationale**: FR-016 列出的情境 003 幾乎都已涵蓋；只補受保護範圍。
- **Alternatives considered**: 寫入前呼叫 `spreadsheets.get` 讀 `protectedRanges` 主動檢查 → 多一次 API 呼叫且仍需處理寫入時的 403，否決。

## R8. 冪等與並行確認

- **Decision**: `PreviewEntry.state: 'READY' | 'WRITING' | 'DONE'`。`confirm()` 以同步程式碼檢查並設為 `WRITING` 後才 `await` Google（Node 單執行緒，檢查與設定之間不會插入其他請求）。`WRITING` 時再次確認 → `WRITEBACK_IN_PROGRESS`（409）；`DONE` → 回傳快取的同一份 `WritebackOutcome`（200）。失敗時回到 `READY`（可重試；若為 `WRITEBACK_STALE` 則標記失效）。另以全域旗標限制同時只有一個寫回在進行（不同預覽也不可並行）。
- **Rationale**: FR-015；與 004 狀態機「同步臨界區」的作法一致。
- **Alternatives considered**: 資料庫鎖 → 預覽本來就只在記憶體，否決。

## R9. 資料來源：最近一場活動與有效輪次

- **Decision**: 新增 `ActivityResultReader`（唯讀）：
  - `latestActivity()`：`SELECT … FROM activities ORDER BY started_at DESC LIMIT 1`（排除 `started_at IS NULL` 的 002 mock 活動）。
  - `validResults(activityId)`：每題回傳狀態、目前輪次、`opened_at`、參與組別（`question_participants` 目前輪次）、目前輪次未作廢的 `submissions`＋`submission_parts`、未作廢的 `question_results`＋`result_parts`。`ANSWERING` 的題目不帶任何送出（FR-002，含舊輪次）。
- **Rationale**: 寫回與 CSV 共用同一份讀取規則，確保「只含已結束題目的有效輪次」只實作一次（FR-002、FR-019）。
- **Alternatives considered**: 重用 `MonitorViewBuilder.buildResult` → 回傳畫面 DTO（含送出者姓名），且逐題查詢，否決。

## R10. CSV 編碼與防公式注入

- **Decision**: `CsvEncoder`（純函式，無相依）：
  - 輸出 `﻿` + 以 `\r\n` 連接的列；欄位以 `,` 分隔。
  - `neutralizeFormula(v)`：`v` 以 `=` 或 `@` 開頭時前置 `'`；其他（含 `+`、`-`、Tab、CR）不變（spec Clarifications Q3）。
  - `escapeField(v)`：含 `,`、`"`、`\r`、`\n` 時以 `"` 包住，內部 `"` → `""`。順序為先 `neutralizeFormula` 再 `escapeField`。
  - 送出時間：`((receivedAt - openedAt) / 1000).toFixed(1)`。
- **Rationale**: FR-020、FR-021；純函式便於以表格式單元測試覆蓋所有邊界。
- **Alternatives considered**: 引入 `csv-stringify` 等套件 → 需求簡單且需客製防注入規則，不新增相依，否決。

## R11. CSV 下載方式

- **Decision**: `GET /api/teacher/activity/export.csv` 回傳 `text/csv; charset=utf-8`，`Content-Disposition: attachment; filename="activity-results.csv"; filename*=UTF-8''<percent-encoded 搶答結果_YYYYMMDD-HHmm.csv>`。前端以 `fetch` 取得：成功時轉為 Blob 並以暫時的 `<a download>` 觸發下載；失敗時解析 JSON 錯誤顯示訊息。日期時間以伺服器本地時區格式化（與 004 `newActivityId` 一致）。
- **Rationale**: 以 `fetch` 才能在 403／409 時顯示清楚訊息而不是下載一份錯誤 JSON；`filename*` 讓中文檔名在主流瀏覽器正確顯示，ASCII `filename` 作後備。
- **Alternatives considered**: 前端組 CSV → 需把所有送出資料傳到前端，且防注入規則需前後端各一份，否決。

## R12. 錯誤碼（新增，放在 `backend/src/lib/errors.ts`，與 003 的 Google 錯誤同一表）

| 碼 | HTTP | 訊息（hint） |
|----|------|--------------|
| `NO_ACTIVITY_RESULTS` | 404 | 尚無搶答活動結果可寫回或匯出（請先開始活動並完成至少一題） |
| `WRITEBACK_NO_SOURCE` | 409 | 本場活動沒有記錄來源試算表，無法寫回（寫回功能上線前開始或非匯入題目的活動；可改用匯出 CSV） |
| `WRITEBACK_NOTHING_TO_WRITE` | 409 | 本場活動沒有搶答成功的答案可寫回（可先匯出 CSV 保存結果） |
| `WRITEBACK_NOT_THIS_SHEET` | 409 | 這份學習單上找不到本場活動的作答格標註（請確認是否為本場活動使用的學習單：<名稱>） |
| `WRITEBACK_PREVIEW_EXPIRED` | 410 | 預覽已失效（請重新預覽） |
| `WRITEBACK_STALE` | 409 | 作答格變動：「學習單在預覽後有變動（第 N 題作答格），請重新預覽」；結果變動：「搶答結果在預覽後有變動（第 N 題），請重新預覽」 |
| `WRITEBACK_IN_PROGRESS` | 409 | 寫回進行中，請稍候 |
| `WRITEBACK_OVERWRITE_REQUIRED` | 400 | 有作答格已有內容，請選擇「全部覆蓋」或「略過已有內容的格子」 |
| `SHEET_PROTECTED_RANGE` | 403 | 作答格位於受保護範圍（請試算表擁有者解除保護或將你加入可編輯名單） |

驗證錯誤（`mode` 不在允許值、`fallbackKeys` 不屬於本預覽的 `ANNOTATION_MISSING` 項目）沿用 `VALIDATION_ERROR` 並指出欄位。

## R13. 紀錄（FR-025）

- **Decision**: 新表 `export_events`（id、at、actor_id、activity_id、type `WRITEBACK_SUCCEEDED`／`WRITEBACK_FAILED`／`CSV_EXPORTED`、spreadsheet_id、written、overwritten、skipped、rows、failure_code）。不存答案、token、試算表內容。Logger 只記錄錯誤碼與計數。
- **Rationale**: 與 004 `activity_events` 分開，避免擴充其 CHECK 約束；欄位皆為計數，不含個資。

## R14. 前端互動

- **Decision**: `ActivityControlPage` 頂部工具列與 `ActivitySummary` 各放「寫回 Google 試算表」「匯出結果 CSV」（`NONE` 階段停用並顯示 `NO_ACTIVITY_RESULTS` 文案）。`WritebackPreviewDialog` 為全螢幕對話框（手機）／置中對話框（桌機）：摘要 → 目標試算表名稱 → 項目清單（卡片式，長內容折行，無水平捲動）→ 不寫入題目 → 覆蓋選項（有 `OVERWRITE` 時必選，radio）→「確認寫回」（撞色珊瑚橘）。完成後切到 `WritebackResultPanel` 顯示計數與「開啟試算表」連結。`GOOGLE_NOT_CONNECTED`／`GOOGLE_AUTH_EXPIRED` 顯示前往題目管理連結 Google 的按鈕。
- **Rationale**: FR-026、FR-027、SC-010；沿用 003 的對話框與 004 的撞色規範。

## R15. 測試策略

- **Decision**:
  - shared：`resultExport.test.ts`（`WritebackRules`）。
  - backend unit：`csvEncoder.test.ts`（BOM、CRLF、逗號／引號／換行、`= @` 加前綴、`+ - Tab CR` 不加）、`activityResultReader.test.ts`（作廢輪次、作答中、未開放）、`writebackService.test.ts`（以 fake `SheetsGateway`：EMPTY／OVERWRITE／SAME／MISSING／DUPLICATED、mode 篩選、STALE、冪等、錯誤對應）、`migrations.test.ts`（v5）。
  - backend integration（supertest）：`writeback.preview.test.ts`、`writeback.confirm.test.ts`、`export.csv.test.ts`、`resultExport.auth.test.ts`（學生 403、未登入 401）。
  - frontend：`WritebackPreviewDialog.test.tsx`、`ExportCsvButton.test.tsx`、`narrowScreen` 擴充。
  - 架構：`diagram-consistency.test.ts` 加入 005。
  - 一律使用 003 既有的 fake Google gateway 與虛構資料，不需真實憑證（原則 IV）。
