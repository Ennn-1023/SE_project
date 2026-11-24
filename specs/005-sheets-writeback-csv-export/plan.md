# Implementation Plan: 答案寫回 Google 試算表＋活動結果匯出 CSV（F10＋F11）

**Branch**: `005-sheets-writeback-csv-export` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-sheets-writeback-csv-export/spec.md`

**Note**: This template is filled in by the `$speckit-plan` command; its definition describes the execution workflow.

## Summary

老師在「搶答活動」頁（進行中或活動結束後）可對**最近一場活動**做兩件事：(1) **寫回 Google 試算表**——預覽每題搶答成功組別的答案將寫入哪個作答格（依 003 的試算表標註找出目前位置，題組各小題各自一格），確認覆蓋選項（全部覆蓋／略過已有內容）後，重新比對並以單一批次、純文字寫入；(2) **匯出結果 CSV**——每題每組每小題一列（題號、小題、題目狀態、組別、搶答順位、是否搶答成功、送出時間、答案），UTF-8 BOM＋CRLF，`=`、`@` 開頭加 `'` 防公式注入，不含學生個資。兩者只讀取已結束題目的有效輪次。

技術做法：**唯讀重用 004 的活動資料、重用 003 的 Google 串接**。新增 `ActivityResultReader`（共用的有效結果讀取）、`WritebackService`（記憶體預覽、`SheetsService.readSheet`＋`AnnotationCodec.decode` 定位、重新比對、冪等、`writeCells` RAW 單批寫入）、`CsvExportService`＋`CsvEncoder`、`ResultExportRoutes`、`ExportEventRepository`、`WritebackTargetRepository`。migration v5 讓 `startActivity` 在題目快照中記錄來源試算表與作答格後備位置。前端在 `ActivityControlPage` 加入 `WritebackPreviewDialog`、`WritebackResultPanel`、`ExportCsvButton`。架構依 `./diagrams/005-*.puml`（憲章原則 VI），決策見 [research.md](research.md)。

## Technical Context

**Language/Version**: TypeScript 6（`strict: true`），Node.js ≥ 24（沿用）

**Primary Dependencies**:
- 後端：沿用 Express 5、zod 4、`node:sqlite`、003 的 `SheetsGateway`（fetch 呼叫 Google Sheets API v4）。**不新增執行期套件**（CSV 自行編碼，research R10）。
- 前端：沿用 React 19、react-router 7、Tailwind v4。
- 共用：`@buzzer/shared` 新增 `resultExport.ts`（`WritebackRules`、DTO、`CSV_HEADERS`）。

**Storage**: SQLite，migration version 5：`activities` 加來源試算表欄位、`question_parts` 加 `answer_cell`、新增 `export_events`（[data-model.md §1](data-model.md)）。寫回預覽只在記憶體（research R4）。

**Testing**: Vitest（shared、backend、frontend）；後端 supertest；Google 以 `tests/helpers/fakeGoogle.ts`（003）模擬；架構測試 `diagram-consistency.test.ts` 擴充至 005。

**Target Platform**: Node.js 伺服器；近兩年主流手機、平板、桌機瀏覽器；CSV 以 Excel（Windows／macOS）與 Google 試算表開啟。

**Project Type**: Web application（frontend＋backend＋shared）

**Performance Goals**: 200 題 × 10 小題 × 10 組的活動，寫回預覽與 CSV 匯出各 ≤ 10 秒（SC-009）；寫回每次確認只呼叫 Google 2 次讀取（`spreadsheets.get`＋格子／metadata，沿用 `readSheet`）＋ 1 次寫入。

**Constraints**: 全有或全無寫入（FR-013）；只寫成功組別、只寫有效輪次（SC-003）；未經選擇不覆蓋（SC-004）；學生 0 筆結果資料（SC-008）；CSV 不含學生個資；375px 無水平捲動（SC-010）；不新增機敏環境變數。

**Scale/Scope**: 單一老師；最近一場活動；最多 200 題 × 10 小題（2000 作答格）、50 組；3 個新 REST 端點；3 個新前端元件；4 張設計圖。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 檢查項目 | Phase 0 前 | Phase 1 後 | 依據 |
|------|----------|-----------|-----------|------|
| I. 輸入驗證 | `previewId`、`mode`、`fallbackKeys` 以 zod `.strict()`＋`WritebackRules` 在進入點驗證；`fallbackKeys` 只接受本預覽的 `ANNOTATION_MISSING` 項目；所有端點檢查老師身分 | ✅ 規劃 | ✅ [openapi.yaml](contracts/openapi.yaml) `ConfirmBody`；[data-model.md §6](data-model.md) 驗證總表 | R8、R12 |
| II. 清楚錯誤訊息 | 新增 9 個錯誤碼（含 hint）；Google 錯誤沿用 003 對應並補受保護範圍；`WRITEBACK_STALE` 指出變動題號；不含 token 與內部細節 | ✅ 規劃 | ✅ research R12 錯誤表、openapi `ErrorResponse` | R7、R12 |
| III. 機敏資料只放環境變數 | 不新增機敏變數；Google token 沿用 003 加密保存；`export_events` 與 log 不含答案、token、試算表內容 | ✅ 無新增 | ✅ data-model §1.3 | R13 |
| IV. 正常＋邊界案例測試 | 每個 FR 有正常與邊界案例：CSV 跳脫／注入表格測試、五種項目狀態、兩種 mode、STALE、冪等、Google 錯誤、權限、作廢輪次 | ✅ 規劃 | ✅ [quickstart.md §2](quickstart.md) 測試群組對照 spec | R15 |
| V. 回報測試指令與結果 | `npm test` 與分區指令 | ✅ 規劃 | ✅ quickstart §2、§4 | quickstart |
| VI. PlantUML 設計優先 | 組件圖、類別圖、2 張時序圖於 specify 產生；plan 依 research R3 更新（改用 `readSheet`＋`AnnotationCodec`、預覽存記憶體）並重新產生 PNG；plan 以圖為藍圖 | ✅ 4 張圖與 PNG | ✅ 下方對照表；`diagram-consistency.test.ts` 擴充為 001＋003＋004＋005 | R1 |

**Gate 結果**：全部通過，無需填寫 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/005-sheets-writeback-csv-export/
├── plan.md              # 本文件
├── research.md          # Phase 0：設計決策 R1～R15
├── data-model.md        # Phase 1：migration v5、讀取模型、預覽狀態、CSV 列、驗證
├── quickstart.md        # Phase 1：測試指令與手動驗證情境
├── contracts/
│   ├── openapi.yaml     # REST API（寫回預覽／確認、匯出 CSV）
│   ├── csv-format.md    # CSV 編碼、欄位、跳脫規則與範例
│   └── ui-routes.md     # 寫回對話框與匯出按鈕的畫面狀態
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2（/speckit-tasks 產生）

diagrams/
├── 005-component.puml / .png
├── 005-class.puml / .png
├── 005-sequence-writeback.puml / .png
└── 005-sequence-export.puml / .png
```

### Source Code (repository root)

```text
shared/src/
├── resultExport.ts                    # 新增：WritebackRules、OverwriteMode、WritebackItemStatus、SkipReason、DTO、CSV_HEADERS
└── index.ts                           # 匯出 resultExport.ts
shared/tests/resultExport.test.ts

backend/src/
├── db/
│   ├── migrations.ts                  # version 5
│   ├── writebackTargetRepository.ts   # 新增：讀 activities 來源欄位＋question_parts.answer_cell
│   └── exportEventRepository.ts       # 新增
├── data/repositories.ts               # createActivity 寫入來源欄位與 answer_cell（NewActivityQuestion.parts 加 answerCell）
├── domain/buzzerTypes.ts              # Activity 加 source（可為 null）
├── services/
│   ├── activityService.ts             # startActivity 帶入 record.set.source 與 slots[].answerCell
│   ├── activityResultReader.ts        # 新增：latestActivity、validResults
│   ├── writebackService.ts            # 新增：preview、confirm、記憶體預覽、冪等
│   ├── csvExportService.ts            # 新增：export、buildRows
│   ├── csvEncoder.ts                  # 新增：encode、escapeField、neutralizeFormula
│   └── sheetsService.ts               # 不改介面；（locateAnswerCells 保留給 003 測試）
├── integrations/google/googleHttp.ts  # mapGoogleError：寫入 403＋protected → SHEET_PROTECTED_RANGE
├── lib/errors.ts                      # 新增 9 個錯誤碼
├── schemas/resultExport.ts            # 新增：confirmBody（zod .strict()）
├── routes/resultExportRoutes.ts       # 新增：/api/teacher/activity/writeback/*、/export.csv
├── context.ts、app.ts                 # 組裝 Reader、WritebackService（注入 SheetsService、AnnotationCodec）、CsvExportService，掛載路由

backend/tests/
├── unit/csvEncoder.test.ts、activityResultReader.test.ts、writebackService.test.ts、migrations.test.ts（v5）
├── integration/writeback.preview.test.ts、writeback.confirm.test.ts、export.csv.test.ts、resultExport.auth.test.ts、activity.start.test.ts（擴充：FR-005 快照記錄寫回目標）
├── helpers/activity.ts                # 擴充：建立含來源試算表的活動與指定結果
└── architecture/diagram-consistency.test.ts   # 加入 005

frontend/src/
├── api/apiClient.ts                   # 新增 writebackPreview、writebackConfirm、downloadResultsCsv
├── activity/
│   ├── WritebackPreviewDialog.tsx     # 新增
│   ├── WritebackResultPanel.tsx       # 新增
│   ├── ExportCsvButton.tsx            # 新增
│   └── ActivitySummary.tsx            # 加入寫回／匯出按鈕
└── pages/ActivityControlPage.tsx      # 頂部工具列加入入口
frontend/tests/WritebackPreviewDialog.test.tsx、ExportCsvButton.test.tsx、ActivityControlPage.test.tsx、narrowScreen.test.tsx
```

**Structure Decision**: 依 001／003／004 老師端慣例放在 `routes/`、`services/`、`db/`；004 的搶答核心（`domain/`、`data/`）只做最小擴充（題目快照多記來源與後備位置），結果讀取一律經 `ActivityResultReader` 唯讀查詢，不改動 004 的狀態機與結果產生流程。Google 存取完全經由 003 的 `SheetsService`，不直接呼叫 gateway。共用驗證與 DTO 放 `shared`。

## 設計圖對照表（憲章原則 VI）

### 組件圖 → 檔案（[005-component.puml](../../diagrams/005-component.puml)）

| 組件 | 檔案 | 組件 | 檔案 |
|------|------|------|------|
| ActivityControlPage | `frontend/src/pages/ActivityControlPage.tsx` | ResultExportRoutes | `backend/src/routes/resultExportRoutes.ts` |
| ActivitySummary | `frontend/src/activity/ActivitySummary.tsx` | RequireAuth / RequireRole / Validate / ErrorHandler | `backend/src/middleware/requireAuth.ts`、`requireRole.ts`、`validate.ts`、`errorHandler.ts` |
| WritebackPreviewDialog | `frontend/src/activity/WritebackPreviewDialog.tsx` | ActivityResultReader | `backend/src/services/activityResultReader.ts` |
| WritebackResultPanel | `frontend/src/activity/WritebackResultPanel.tsx` | WritebackService | `backend/src/services/writebackService.ts` |
| ExportCsvButton | `frontend/src/activity/ExportCsvButton.tsx` | CsvExportService | `backend/src/services/csvExportService.ts` |
| ApiClient | `frontend/src/api/apiClient.ts` | CsvEncoder | `backend/src/services/csvEncoder.ts` |
| WritebackRules | `shared/src/resultExport.ts` | SheetsService | `backend/src/services/sheetsService.ts`（003） |
| AnnotationCodec | `backend/src/domain/annotationCodec.ts`（003） | ActivityService | `backend/src/services/activityService.ts`（004） |
| Repository | `backend/src/data/repositories.ts`（004） | WritebackTargetRepository | `backend/src/db/writebackTargetRepository.ts` |
| ExportEventRepository | `backend/src/db/exportEventRepository.ts` | GoogleSheetsGateway | `backend/src/integrations/google/sheetsGateway.ts`（003） |
| Logger | `backend/src/lib/logger.ts` | 資料庫 | SQLite（`backend/src/lib/db.ts`） |

`WritebackRules` 以 `export const WritebackRules = { validateOverwriteMode, validateFallbackKeys }` 匯出。`CsvEncoder` 以 `export const CsvEncoder = { encode, escapeField, neutralizeFormula }` 匯出（純函式）。

### 類別圖 → 程式型別（[005-class.puml](../../diagrams/005-class.puml)）

| 類別圖元素 | 程式位置 |
|-----------|----------|
| `WritebackItemStatus`、`SkipReason`、`OverwriteMode`、`WritebackRules` | `shared/src/resultExport.ts` |
| `WritebackPreview`、`WritebackItem`、`SkippedQuestion`、`WritebackSummary`、`WritebackOutcome` | `shared/src/resultExport.ts`（DTO：`…View`）；伺服器內部狀態在 `writebackService.ts` |
| `CsvQuestionStatus`、`CsvResultRow` | `backend/src/services/csvExportService.ts` |
| `WritebackTarget`、`AnswerSlotFallback` | `backend/src/db/writebackTargetRepository.ts`（資料表見 data-model §1.1、§1.2） |
| `ExportEvent`、`ExportEventType` | `backend/src/db/exportEventRepository.ts` |
| `ActivityResultReader`、`WritebackService`、`CsvExportService`、`CsvEncoder` | `backend/src/services/` 同名檔；公開方法與類別圖相同 |
| `SheetsService`、`AnnotationCodec` | 003 既有，不改公開介面 |

### 基礎設施檔案允許清單

| 檔案 | 角色 |
|------|------|
| `backend/src/schemas/resultExport.ts` | `Validate` 使用的 zod schema（對應 openapi `ConfirmBody`） |
| `backend/src/db/migrations.ts` | version 5 |
| `backend/src/context.ts`、`backend/src/app.ts` | 組裝 |
| `backend/src/lib/errors.ts`、`backend/src/integrations/google/googleHttp.ts` | 錯誤碼與 Google 錯誤對應 |

### 時序圖 → 程式流程

| 時序圖 | 端點 | 主要測試 |
|--------|------|----------|
| [005-sequence-writeback](../../diagrams/005-sequence-writeback.puml)：寫回預覽 | `POST /api/teacher/activity/writeback/preview` | `writeback.preview.test.ts`、`writebackService.test.ts` |
| 同上：確認寫回（重新比對、mode 篩選、單批寫入、錯誤） | `POST /api/teacher/activity/writeback/confirm` | `writeback.confirm.test.ts`、`writebackService.test.ts` |
| [005-sequence-export](../../diagrams/005-sequence-export.puml) | `GET /api/teacher/activity/export.csv` | `export.csv.test.ts`、`csvEncoder.test.ts` |

## 實作要點

1. **快照先行**：先完成 migration v5 與 `startActivity` 記錄來源（data-model §1），否則寫回無目標；既有 004 測試需確認 `createActivity` 新欄位不影響 mock 活動（來源為 NULL）。
2. **讀取規則唯一**：寫回與 CSV 都只透過 `ActivityResultReader.validResults()` 取資料；`ANSWERING` 題目不帶任何輪次的送出（FR-002）。
3. **預覽與確認共用 `resolveItems`**：預覽與 recheck 呼叫同一函式產生 `(key, status, cell, currentContent)`，確認時逐項比較並比對結果指紋；不同即 `WRITEBACK_STALE`，不呼叫 `writeCells`（FR-012）。
4. **同步臨界區**：`confirm()` 在第一個 `await` 之前完成「查預覽 → 檢查 state → 設為 `WRITING` → 設全域旗標」；`finally` 清旗標（research R8）。
5. **寫入內容**：`updates` 只含要寫的格子，值為答案原文（不 trim、不加組名，Clarifications Q5）；`valueInputOption: RAW`（003 既有）。
6. **CSV 回應**：路由設定 `Content-Type`、`Content-Disposition`（research R11）並直接 `res.send(string)`；`export_events` 在送出前寫入。
7. **前端下載**：`downloadResultsCsv()` 以 `fetch` 取得；`ok` 時 `blob()` → `URL.createObjectURL` → 暫時 `<a download>` → `revokeObjectURL`；否則解析 `ErrorResponse`。
8. **純文字呈現**：預覽卡片的答案、組名、目前內容皆為 React 文字節點＋`whitespace-pre-wrap break-words`（FR-027、SC-010）。

## Complexity Tracking

無違反憲章的項目。
