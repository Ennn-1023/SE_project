# Data Model: 學習單題目匯入（F3＋F4 互動標註）

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

時間欄位一律為 ISO 8601 字串（與 001 一致）。所有資料表於 migration **version 3** 建立。格子位置一律以 A1 表示法（例如 `G5`）記錄合併範圍的**左上角**；對外呈現時加上分頁名稱（`學習單!G5`）。

---

## 1. 資料表

### 1.1 `google_connections` — Google 帳號連結（spec Key Entity: Google Connection）

| 欄位 | 型別 | 規則 |
|---|---|---|
| `user_id` | INTEGER PK | FK → `users.id` ON DELETE CASCADE；角色須為 TEACHER（由服務層檢查） |
| `google_email` | TEXT NOT NULL | 1–320 字元 |
| `refresh_token_enc` | TEXT NOT NULL | AES-256-GCM 密文（`iv.tag.ciphertext`，base64） |
| `access_token_enc` | TEXT | 同上；可為 NULL（尚未取得或已過期清除） |
| `access_token_expires_at` | TEXT | |
| `scopes` | TEXT NOT NULL | 以空白分隔；須含 `https://www.googleapis.com/auth/spreadsheets` |
| `connected_at` | TEXT NOT NULL | |
| `last_used_at` | TEXT NOT NULL | |

每位老師最多一筆（PK）。中斷連結＝刪除資料列。

### 1.2 `oauth_states` — 進行中的授權請求

| 欄位 | 型別 | 規則 |
|---|---|---|
| `state` | TEXT PK | 32 bytes 隨機值（base64url） |
| `user_id` | INTEGER NOT NULL | FK → `users.id` ON DELETE CASCADE |
| `session_id` | TEXT NOT NULL | 發起授權的 session；回呼時須與目前 session 相同 |
| `code_verifier_enc` | TEXT NOT NULL | PKCE verifier 的密文 |
| `created_at` | TEXT NOT NULL | |
| `expires_at` | TEXT NOT NULL | `created_at` + 10 分鐘 |

回呼時使用一次即刪除；過期資料在每次 start 時順便清除。

### 1.3 `import_drafts` — 標註草稿（Annotation Draft）

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id` | TEXT PK | UUID |
| `user_id` | INTEGER NOT NULL | FK → `users.id` ON DELETE CASCADE |
| `status` | TEXT NOT NULL | `OPEN` \| `CONFIRMED` \| `CANCELLED` |
| `spreadsheet_id` | TEXT NOT NULL | 20–100 字元 `[A-Za-z0-9_-]` |
| `spreadsheet_title` | TEXT NOT NULL | |
| `sheet_id` | INTEGER NOT NULL | Google 的 `sheetId`（＝連結中的 `gid`） |
| `sheet_title` | TEXT NOT NULL | |
| `source_url` | TEXT NOT NULL | ≤ 2,000 字元，老師貼上的原始連結 |
| `sheets_json` | TEXT NOT NULL | 可選分頁清單 `[{sheetId,title}]` |
| `snapshot_json` | TEXT NOT NULL | `GridSnapshot`（§2.1） |
| `metadata_fingerprint` | TEXT NOT NULL | 讀取當下本系統 metadata 的 SHA-256（R4） |
| `annotations_json` | TEXT NOT NULL | `AnnotationDocument`（§2.2） |
| `restored_count` | INTEGER NOT NULL DEFAULT 0 | 帶回的題數（FR-024） |
| `revision` | INTEGER NOT NULL DEFAULT 0 | 每次儲存標註 +1 |
| `created_at` / `updated_at` | TEXT NOT NULL | |
| `expires_at` | TEXT NOT NULL | 每次儲存標註時設為 now + 30 分鐘 |

索引：`UNIQUE (user_id) WHERE status = 'OPEN'`（每位老師最多一筆有效草稿；建立新草稿時舊的 OPEN 草稿改為 CANCELLED）。

狀態轉換：

```text
OPEN --confirm 成功--> CONFIRMED   （再次 confirm：回傳既有結果，冪等）
OPEN --取消／新草稿／過期--> CANCELLED
OPEN 且 expires_at < now：視為過期，任何操作回 DRAFT_EXPIRED
```

### 1.4 `question_sets` — 目前題目集（Question Set，只保留一份）

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id` | INTEGER PK | `CHECK (id = 1)`（單例） |
| `spreadsheet_id` / `spreadsheet_title` | TEXT NOT NULL | |
| `sheet_id` / `sheet_title` | INTEGER / TEXT NOT NULL | |
| `source_url` | TEXT NOT NULL | |
| `question_count` | INTEGER NOT NULL | 1–200 |
| `slot_count` | INTEGER NOT NULL | 1–2,000 |
| `imported_at` | TEXT NOT NULL | |
| `imported_by` | INTEGER NOT NULL | FK → `users.id` |
| `draft_id` | TEXT NOT NULL UNIQUE | 來源草稿（冪等依據） |

取代題目集＝在同一交易中刪除舊 `question_sets`（連帶刪除題目與作答項目）再寫入新資料。清除題目集＝刪除該列。

### 1.5 `question_set_questions` — 題目（Question）

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `question_set_id` | INTEGER NOT NULL | FK → `question_sets.id` ON DELETE CASCADE |
| `position` | INTEGER NOT NULL | 1 起算；`UNIQUE (question_set_id, position)` |
| `question_key` | TEXT NOT NULL | 標註中的題目 key（4–12 字元英數）；`UNIQUE (question_set_id, question_key)` |
| `label` | TEXT NOT NULL | 題號，1–20 字元；`UNIQUE (question_set_id, label)` |
| `kind` | TEXT NOT NULL | `SINGLE` \| `GROUP` |
| `stem_text` | TEXT | 僅 GROUP 可有；1–2,000 字元 |
| `stem_cell` | TEXT | A1 表示法 |

### 1.6 `answer_slots` — 作答項目（Answer Slot）

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `question_id` | INTEGER NOT NULL | FK → `question_set_questions.id` ON DELETE CASCADE |
| `part_index` | INTEGER NOT NULL | 0 起算；`UNIQUE (question_id, part_index)`；單題為 0 |
| `part_label` | TEXT | GROUP 為「（1）」「（2）」…；SINGLE 為 NULL |
| `question_text` | TEXT NOT NULL | 1–2,000 字元（匯入當下的文字快照） |
| `question_cell` | TEXT NOT NULL | A1 |
| `answer_cell` | TEXT NOT NULL | A1（匯入當下位置；F10 以標註重新定位，R3） |
| `answer_had_content` | INTEGER NOT NULL | 0/1，匯入時作答格是否已有內容（不保存內容本身） |

不含正確答案（FR-022）。

### 1.7 `question_events` — 題目操作紀錄（Question Event）

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `at` | TEXT NOT NULL | |
| `actor_user_id` | INTEGER NOT NULL | FK → `users.id` |
| `type` | TEXT NOT NULL | `GOOGLE_CONNECTED` \| `GOOGLE_DISCONNECTED` \| `IMPORTED` \| `REIMPORTED` \| `CLEARED` |
| `spreadsheet_id` | TEXT | |
| `sheet_title` | TEXT | |
| `question_count` | INTEGER | |

不含 token、email 以外的個資或學習單內容（FR-032）。

---

## 2. 共用型別（`@buzzer/shared` 的 `annotation.ts`）

### 2.1 `GridSnapshot` — 讀取當下的學習單格子

```text
GridSnapshot {
  rowCount: int            // 使用範圍列數，1–500
  columnCount: int         // 使用範圍欄數，1–52
  cells: { ref: "C5", text: string, error: boolean }[]   // 只列非空白格
  merges: { start: "C5", end: "F5" }[]
  hiddenRows: int[]        // 1 起算
  hiddenColumns: int[]     // 1 起算
}
```

### 2.2 `AnnotationDocument` — 老師的標註（草稿內容，也是帶回的結果）

```text
AnnotationDocument {
  questions: AnnotatedQuestion[]       // 順序＝題目順序，≤ 200
}
AnnotatedQuestion {
  key: string          // 4–12 英數，前端建立時產生，草稿內唯一；寫入 metadata 的 "q"
  label: string        // 題號，1–20 字元（去頭尾空白後）
  labelManual: boolean // 老師是否手動改過題號（FR-017 自動重編依據）
  kind: "SINGLE" | "GROUP"
  stemCell: CellRef | null   // 僅 GROUP
  parts: AnnotatedPart[]     // SINGLE 恰 1 個；GROUP 1–10 個
}
AnnotatedPart {
  questionCell: CellRef | null   // 未完成時為 null
  answerCell: CellRef | null
}
CellRef = string   // A1，^[A-Z]{1,2}[1-9][0-9]{0,2}$，須在快照範圍內，自動正規化為合併範圍左上角
```

### 2.3 `ValidationResult`

```text
ValidationResult {
  issues: Issue[]       // 阻擋預覽／匯入
  warnings: Issue[]     // 只提醒
  totalIssues: int      // issues 超過 50 項時 issues 只回前 50 項
}
Issue {
  code: IssueCode
  questionKey?: string
  partIndex?: int
  cell?: CellRef
  message: string       // 例：「第 4 題缺少作答格」
  hint: string          // 例：「請點選該題的作答格」
}
```

`IssueCode`：

| code | 類別 | 觸發條件 |
|---|---|---|
| `CELL_OUT_OF_RANGE` | issue | 格子不在快照範圍內 |
| `CELL_ROLE_CONFLICT` | issue | 同一格擔任兩個以上角色（FR-015） |
| `SAME_CELL_QA` | issue | 題目格＝作答格 |
| `QUESTION_TEXT_EMPTY` | issue | 題目格或共同題幹格無文字 |
| `QUESTION_TEXT_TOO_LONG` | issue | 超過 2,000 字元 |
| `QUESTION_TEXT_ERROR_VALUE` | issue | 公式錯誤值 |
| `LABEL_INVALID` | issue | 題號空白或超過 20 字元 |
| `LABEL_DUPLICATE` | issue | 題號重複 |
| `TOO_MANY_QUESTIONS` | issue | > 200 題 |
| `TOO_MANY_PARTS` | issue | 題組 > 10 小題 |
| `SINGLE_SHAPE_INVALID` | issue | 單題的小題數 ≠ 1 或有共同題幹 |
| `MISSING_QUESTION_CELL` | issue（preview／confirm 時） | 小題缺題目格 |
| `MISSING_ANSWER_CELL` | issue（preview／confirm 時） | 小題缺作答格 |
| `GROUP_WITHOUT_PARTS` | issue（preview／confirm 時） | 題組沒有小題 |
| `NO_QUESTIONS` | issue（preview／confirm 時） | 一題都沒有 |
| `ANSWER_HAS_CONTENT` | warning | 作答格已有內容 |
| `CELL_HIDDEN` | warning | 格子位於隱藏列欄 |
| `GROUP_SINGLE_PART` | warning | 題組只有一個小題 |
| `RESTORED_CELL_MISSING` | warning | 帶回時格子已不存在（該小題的格子設為 null） |
| `RESTORED_CONFLICT` | warning | 帶回時兩個標註落在同一格（兩者皆設為 null） |

### 2.4 `QuestionSetView`（對外呈現的題目集／預覽）

```text
QuestionSetView {
  source: { spreadsheetId, spreadsheetTitle, sheetId, sheetTitle, sourceUrl }
  questionCount: int
  slotCount: int
  importedAt?: string            // 預覽時無
  questions: {
    label: string
    kind: "SINGLE" | "GROUP"
    stem: { text, cell } | null
    parts: { partLabel: string | null, text: string, questionCell: string, answerCell: string, answerHasContent: boolean }[]
  }[]
  warnings: Issue[]              // 僅預覽
}
```

`questionCell`／`answerCell` 對外呈現為 `分頁名稱!A1`。

---

## 3. 試算表上的標註（Developer Metadata，R3）

| metadataKey | location | value |
|---|---|---|
| `qimport.set` | 分頁（`sheetId`） | `{"v":1,"qs":[{"q":key,"n":label,"m":0\|1,"k":"S"\|"G","np":小題數,"s":0\|1}]}`（`np`、`s` 用來偵測整列被刪除的小題與共同題幹） |
| `qimport.row` | 單一列（`dimensionRange` ROWS） | `[{"c":colAnchor,"q":key,"p":partIndex,"r":"Q"\|"A"\|"S"}]` |
| `qimport.col` | 單一欄（`dimensionRange` COLUMNS） | `{"c":colAnchor}` |

- `visibility` 一律為 `PROJECT`。
- `colAnchor`：4–8 字元英數，同一分頁內唯一；確認匯入時重新產生。
- 共同題幹的 `p` 固定為 `-1`。
- `AnnotationCodec.encode(doc, snapshot) → MetadataEntry[]`、`decode(entries, snapshot) → { doc, warnings }`；encode 後 decode 必須得到相同的文件（往返測試）。

---

## 4. 與其他功能的關係

- `users`（001）：老師身分、外鍵。
- `questions`（002 搶答活動）：本功能不修改；F5 建立活動時由 `question_set_questions`／`answer_slots` 複製。
- F10 寫回：使用 `answer_slots` 的 `question_key`＋`part_index`，透過 `SheetsService.locateAnswerCells()` 取得目前位置，再以 `writeCells()` 寫入。
