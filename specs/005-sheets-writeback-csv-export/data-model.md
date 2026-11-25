# Data Model: 答案寫回 Google 試算表＋活動結果匯出 CSV（F10＋F11）

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

對應類別圖 [`diagrams/005-class.puml`](../../diagrams/005-class.puml)。004 的活動、題目、送出、結果資料表（migration v4）沿用，只新增欄位與一張事件表。

---

## 1. Migration version 5（`backend/src/db/migrations.ts`）

### 1.1 `activities`（擴充）— 寫回目標（Writeback Target，FR-005）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `spreadsheet_id` | TEXT | NULL 或長度 20～100 | 開始活動時題目集的來源試算表 |
| `spreadsheet_title` | TEXT | NULL 或 1～200 字 | 顯示用 |
| `sheet_id` | INTEGER | NULL 或 ≥ 0 | 分頁識別（改名後仍可找到） |
| `sheet_title` | TEXT | NULL 或 1～200 字 | 開始時的分頁名稱，顯示用 |
| `source_url` | TEXT | NULL 或非空字串 | 「開啟試算表」連結 |

- 上表五個欄位（`spreadsheet_id`、`spreadsheet_title`、`sheet_id`、`sheet_title`、`source_url`）同時為 NULL 或同時非 NULL（CHECK）；長度與數值範圍也以 CHECK 實作。v5 之前的活動與 002 mock 活動為 NULL → 寫回回覆 `WRITEBACK_NO_SOURCE`。
- 寫入時機：`ActivityService.startActivity` 建立活動的同一個交易，取自 `record.set.source`。

### 1.2 `question_parts`（擴充）— 作答格後備位置（Answer Slot Fallback，FR-010）

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `answer_cell` | TEXT | NULL 或 A1 格式（`^[A-Z]{1,3}[1-9][0-9]{0,6}$`） | 匯入當下記錄的作答格位置 |

- 寫入時機：`startActivity` 複製 `slots[].answerCell`。
- 識別一個作答格：`questions.question_key`（003 題目 key，與試算表標註的 `q` 對應）＋`question_parts.part_index`。

### 1.3 `export_events`（新增）— 寫回／匯出紀錄（FR-025）

| 欄位 | 型別 | 約束 |
|------|------|------|
| `id` | INTEGER | PK AUTOINCREMENT |
| `at` | TEXT | ISO 8601，NOT NULL |
| `actor_id` | INTEGER | NOT NULL，REFERENCES users(id) |
| `activity_id` | TEXT | NOT NULL |
| `type` | TEXT | `WRITEBACK_SUCCEEDED`／`WRITEBACK_FAILED`／`CSV_EXPORTED` |
| `spreadsheet_id` | TEXT | NULL（CSV 時為 NULL） |
| `written` | INTEGER | ≥ 0，預設 0 |
| `overwritten` | INTEGER | ≥ 0，預設 0 |
| `skipped` | INTEGER | ≥ 0，預設 0 |
| `rows` | INTEGER | ≥ 0，預設 0（CSV 列數，不含標題） |
| `failure_code` | TEXT | NULL；僅 `WRITEBACK_FAILED` 填錯誤碼 |

索引：`(activity_id, id)`。**不保存**答案、試算表內容、token。

---

## 2. 讀取模型（`ActivityResultReader`，research R9）

```text
QuestionOutcome {
  questionId, questionKey, position, label, kind,
  status: 'CLOSED' | 'ANSWERING' | 'NOT_OPENED',
  round, openedAt,                       // 目前輪次
  parts: { partIndex, partLabel, fallbackCell }[],
  teams: { teamId, teamName, groupNumber }[],          // 目前輪次參與組別（CLOSED 才有）
  submissions: { teamId, rank, receivedAt, answers: { partIndex, answer }[] }[],  // 有效輪次，依 rank
  winner: { teamId, teamName, answers: { partIndex, answer }[] } | null           // 有效結果
}
```

規則：
- 只讀 `latestActivity()`（`started_at` 最大且非 NULL）。
- `status = ANSWERING` 或 `NOT_OPENED` 時 `teams`、`submissions` 為空、`winner = null`（FR-002，舊輪次也不帶）。
- `CLOSED` 時只取 `voided = 0` 的 `submissions`／`question_results` 與其 parts（FR-019、004 FR-007a）。
- 送出者（`student_id`）不讀出（Clarifications Q4）。

---

## 3. 寫回預覽（記憶體，research R4、R5）

### 3.1 `WritebackPreview`

| 欄位 | 說明 |
|------|------|
| `previewId` | 12 字元 base64url，隨機 |
| `teacherId` | 建立者；每位老師只保留最新一份 |
| `activityId` | 最近一場活動 |
| `target` | `{ spreadsheetId, spreadsheetTitle, sheetId, sheetTitle（目前名稱）, sourceUrl }` |
| `createdAt` | 15 分鐘後失效 |
| `resultFingerprint` | 有效結果指紋（SHA-256 of 排序後的 `questionId:round:winnerTeam`） |
| `items` | `WritebackItem[]` |
| `skipped` | `{ questionNumber, reason: NO_WINNER / NOT_OPENED / ANSWERING }[]` |
| `summary` | `{ emptyCount, overwriteCount, sameCount, unresolvedCount, skippedQuestionCount }` |
| `state` | `READY` → `WRITING` → `DONE`（或回 `READY`／失效）|
| `outcome` | `DONE` 時快取的 `WritebackOutcome` |

### 3.2 `WritebackItem`

| 欄位 | 說明 |
|------|------|
| `key` | `${questionKey}:${partIndex}`，作為 `fallbackKeys` 的值 |
| `questionNumber`、`partLabel` | 顯示用 |
| `cell` | 依標註找到的目前位置；找不到或重複時為 NULL |
| `fallbackCell` | `question_parts.answer_cell` |
| `hidden` | 目標格的列或欄目前被隱藏 |
| `winnerTeamName`、`answer` | 有效結果（題組為該小題答案） |
| `currentContent` | 目標格（或 `ANNOTATION_MISSING` 時後備格）目前顯示值 |
| `status` | 見 3.3 |

### 3.3 項目狀態與是否寫入

| status | 判定 | `SKIP_NON_EMPTY` | `OVERWRITE_ALL` |
|--------|------|------------------|-----------------|
| `EMPTY` | 有位置、目前內容 trim 後為空 | 寫入 | 寫入 |
| `OVERWRITE` | 有位置、內容不同且非空 | 略過（計入 skipped） | 寫入（計入 overwritten） |
| `SAME_CONTENT` | 有位置、trim 後與答案相同 | 不寫（不計覆蓋） | 不寫 |
| `ANNOTATION_MISSING` | `decode` 找不到該作答格 | 僅在 `fallbackKeys` 勾選時寫入後備格；後備格非空時再依 mode 判斷 | 同左 |
| `ANNOTATION_DUPLICATED` | `decode` 回報同格衝突 | 略過 | 略過 |

- 有任何 `OVERWRITE` 時 `mode` 必填，否則 `WRITEBACK_OVERWRITE_REQUIRED`（FR-011）。
- 確認前重新讀取並比對 `(status, cell, currentContent)` 與 `resultFingerprint`；任何不同 → `WRITEBACK_STALE`（FR-012）。

### 3.4 `WritebackOutcome`

`{ writtenCells, writtenQuestions, overwrittenCells, skippedCells, skippedReasons: { reason, count }[], spreadsheetUrl }`

---

## 4. CSV 結果列（`CsvResultRow`，FR-017～FR-021）

| # | 欄位標題 | 內容 |
|---|----------|------|
| 1 | 題號 | `questions.label` |
| 2 | 小題 | 題組：`part_label`（如「（1）」）；單題：空白 |
| 3 | 題目狀態 | 已結束／作答中／未開放 |
| 4 | 組別 | 組名（如「第 2 組」）；作答中／未開放列空白 |
| 5 | 搶答順位 | 數字，或「未送出」 |
| 6 | 是否搶答成功 | 是／否；作答中／未開放列空白 |
| 7 | 送出時間（秒） | `((received_at - opened_at)/1000).toFixed(1)`；未送出空白 |
| 8 | 答案 | 該小題答案；未送出空白 |

排序：題目 `position` → 已送出依 `rank`、未送出依組別編號 → `part_index`。

列數：Σ(已結束題目：參與組數 × 小題數) + 作答中題數 + 未開放題數（SC-007）。

編碼：見 research R10（BOM、CRLF、`= @` 前置 `'`、雙引號跳脫）。檔名：`搶答結果_YYYYMMDD-HHmm.csv`（活動 `started_at`，伺服器本地時區）。

---

## 5. 共用型別與驗證（`shared/src/resultExport.ts`）

| 名稱 | 內容 |
|------|------|
| `OverwriteMode` | `'OVERWRITE_ALL' \| 'SKIP_NON_EMPTY'` |
| `WritebackItemStatus`、`SkipReason` | 見 3.3、3.1 |
| `WritebackPreviewView`、`WritebackItemView`、`WritebackOutcomeView` | API 回應 DTO（[openapi.yaml](contracts/openapi.yaml)） |
| `WritebackRules.validateOverwriteMode(input)` | `undefined` 或允許值之一；其他 → `VALIDATION_ERROR`（field `mode`） |
| `WritebackRules.validateFallbackKeys(input, allowedKeys)` | 陣列、最多 2000 個、每個符合 `^[A-Za-z0-9_-]{4,12}:[0-9]$` 且屬於 `allowedKeys`、不重複；否則 `VALIDATION_ERROR`（field `fallbackKeys`） |
| `CSV_HEADERS` | 第 4 節 8 個欄位標題（前後端測試共用） |

## 6. 輸入驗證總表（原則 I）

| 端點 | 欄位 | 規則 | 錯誤 |
|------|------|------|------|
| `POST /writeback/preview` | （無 body） | 必須為老師；最近活動存在且有來源 | `FORBIDDEN`、`NO_ACTIVITY_RESULTS`、`WRITEBACK_NO_SOURCE`、`WRITEBACK_NOTHING_TO_WRITE` |
| `POST /writeback/confirm` | `previewId` | 字串 12 字元 base64url、存在且屬於本人、未過期 | `VALIDATION_ERROR`、`WRITEBACK_PREVIEW_EXPIRED` |
| | `mode` | 選填；有 `OVERWRITE` 項目時必填 | `VALIDATION_ERROR`、`WRITEBACK_OVERWRITE_REQUIRED` |
| | `fallbackKeys` | 選填陣列；只能是本預覽 `ANNOTATION_MISSING` 項目 | `VALIDATION_ERROR` |
| | （body 其他欄位） | zod `.strict()` 拒絕 | `VALIDATION_ERROR` |
| `GET /export.csv` | （無參數） | 必須為老師；最近活動存在 | `FORBIDDEN`、`NO_ACTIVITY_RESULTS` |
