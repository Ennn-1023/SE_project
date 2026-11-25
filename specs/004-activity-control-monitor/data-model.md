# Data Model: 活動管理與逐題開放控制＋老師即時監控看板（F5＋F8）

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **類別圖**: [004-class.puml](../../diagrams/004-class.puml)

儲存使用既有 SQLite（`node:sqlite`）。本功能新增 **migration version 4**（`backend/src/db/migrations.ts`），擴充 002 的 `activities`、`questions`、`submissions`、`question_results`，並新增 5 張表。時間欄位沿用 002 慣例：搶答相關為 epoch ms（INTEGER），事件紀錄為 ISO 8601 文字。

---

## 1. 資料表

### 1.1 `activities`（擴充 002）

| 欄位 | 型別 | 說明 / 驗證 |
|------|------|-------------|
| `id` | TEXT PK | `ACT-yyyyMMddHHmmss-xxxx`（R3）；舊資料保留 `A1` |
| `phase` | TEXT | `WAITING`／`ANSWERING`／`CLOSED`／`ENDED`（沿用 CHECK） |
| `current_question_id` | TEXT NULL | `ANSWERING`／`CLOSED` 時有值 |
| `opened_at` | INTEGER NULL | **新增**。目前題目本輪開放時間，只在 `ANSWERING` 有值 |
| `ends_at` | INTEGER NULL | 作答結束時間點；開放後不可修改（FR-009a） |
| `started_at` | INTEGER NULL | **新增**。開始活動時間（舊資料為 NULL） |
| `started_by` | INTEGER NULL | **新增**。`users.id`（老師） |
| `ended_at` | INTEGER NULL | **新增** |
| `source_title` | TEXT NULL | **新增**。題目集來源顯示文字（試算表名稱／分頁） |
| `notice` | TEXT NULL | **新增**。重啟取消作答等提示（R5），老師下一次操作後清除 |
| `updated_at` | INTEGER | 沿用 |

不變式：同一時間至多一列 `phase != 'ENDED'`（由 `ActivityService.startActivity` 在交易內檢查）。

Migration：`UPDATE activities SET phase='ENDED', ended_at=? WHERE id='A1' AND phase!='ENDED'`（R2）。

### 1.2 `questions`（擴充 002，即「活動題目」）

| 欄位 | 型別 | 說明 / 驗證 |
|------|------|-------------|
| `question_id` | TEXT PK | `{activityId}-{position}` |
| `activity_id` | TEXT FK | |
| `number` | INTEGER ≥ 1 | 沿用 002，等於題目順序（position） |
| `text` | TEXT | 沿用 002。單題＝題目文字；題組＝共同題幹（無則第 1 小題文字），供 002 既有視圖 |
| `label` | TEXT | **新增**。題號（003 的 label，1～20 字元，例如「Q2」） |
| `kind` | TEXT | **新增**。`SINGLE`／`GROUP`，預設 `SINGLE` |
| `stem` | TEXT NULL | **新增**。題組共同題幹 |
| `question_key` | TEXT NULL | **新增**。003 標註的題目 key（F10 回查用） |
| `status` | TEXT | **新增**。`NOT_OPENED`／`ANSWERING`／`CLOSED`，預設 `NOT_OPENED`（舊資料依是否有結果回填） |
| `current_round` | INTEGER ≥ 0 | **新增**。0＝未開放過 |
| `seconds` | INTEGER NULL | **新增**。本輪作答秒數 5～600 |
| `opened_at`／`closed_at` | INTEGER NULL | **新增**。本輪 |
| `closed_reason` | TEXT NULL | **新增**。`TIME_UP`／`MANUAL`／`ACTIVITY_ENDED` |

### 1.3 `question_parts`（新增）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `question_id` | TEXT FK | |
| `part_index` | INTEGER ≥ 0 | 單題只有 0 |
| `part_label` | TEXT NULL | 「（1）」…；單題為 NULL |
| `question_text` | TEXT | 1～2,000 字元（沿用 003） |
| PK | `(question_id, part_index)` | 每題 1～10 列 |

### 1.4 `question_participants`（新增，參與組別）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `activity_id`、`question_id`、`round` | | 開放當下 |
| `team_id` | TEXT | `T{n}` |
| `member_count` | INTEGER ≥ 1 | 開放當下成員數 |
| PK | `(activity_id, question_id, round, team_id)` | |

### 1.5 `submissions`（重建，新增輪次與作廢）

SQLite 無法修改主鍵，migration 以「建新表 → 複製（`round = 1`、`voided = 0`）→ 刪舊表 → 改名」重建。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `activity_id`、`question_id`、`team_id`、`student_id`、`received_at`、`rank` | | 沿用 002 |
| `answer` | TEXT | 顯示用合併文字（R6） |
| `round` | INTEGER ≥ 1 | **新增** |
| `voided` | INTEGER 0/1 | **新增**，預設 0 |
| PK | `(activity_id, question_id, round, team_id)` | |
| UNIQUE | `(activity_id, question_id, round, rank)` | |

### 1.6 `submission_parts`（新增）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `activity_id`、`question_id`、`round`、`team_id` | | FK → submissions |
| `part_index` | INTEGER ≥ 0 | |
| `answer` | TEXT | 去除前後空白後 1～500 字 |
| PK | `(activity_id, question_id, round, team_id, part_index)` | |

### 1.7 `question_results`（重建）

| 欄位 | 型別 | 說明 |
|------|------|------|
| 沿用 002 | | `activity_id`、`question_id`、`answer`、`winner_team`、`submitted_at`、`closed_reason`、`closed_at` |
| `round` | INTEGER ≥ 1 | **新增** |
| `voided` | INTEGER 0/1 | **新增** |
| PK | `(activity_id, question_id, round)` | |
| 部分唯一索引 | `(activity_id, question_id) WHERE voided = 0` | 保證每題至多一筆有效結果（FR-007a、SC-011） |

### 1.8 `result_parts`（新增）

成功組各小題答案，供 F10 逐格寫回：`(activity_id, question_id, round, part_index)` PK、`answer TEXT`。無人送出時無列。

### 1.9 `activity_events`（新增）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `activity_id` | TEXT | |
| `at` | TEXT | ISO 8601 |
| `actor_id` | INTEGER NULL | 老師 `users.id`；系統事件（時間到、重啟取消）為 NULL |
| `type` | TEXT | `STARTED`／`QUESTION_OPENED`／`QUESTION_REOPENED`／`QUESTION_CLOSED`／`BACK_TO_WAITING`／`ENDED`／`RESTART_CANCELLED` |
| `question_id` | TEXT NULL | |
| `detail` | TEXT NULL | 秒數、結束原因、被作廢結果摘要（組名，**不含答案內容**）（FR-029） |

---

## 2. 狀態轉換

### 2.1 活動階段（`activities.phase`）

| 目前 | 操作 | 條件 | 下一個 | 副作用 |
|------|------|------|--------|--------|
| （無活動／ENDED） | start | 題目集 ≥ 1 題、≥ 1 組有成員 | WAITING | 複製題目、事件 STARTED |
| WAITING／CLOSED | open(Q, s) | Q 為 NOT_OPENED、s ∈ [5,600] 整數 | ANSWERING | Q.round+1、記錄參與組別、計時器 |
| WAITING／CLOSED | reopen(Q, s, confirm) | Q 為 CLOSED、confirm = true | ANSWERING | 同上；舊輪暫不作廢 |
| ANSWERING | 時間到／close | — | CLOSED | `finalize`：作廢較早輪次＋寫入本輪送出與結果 |
| CLOSED | backToWaiting | — | WAITING | — |
| WAITING／CLOSED | end | — | ENDED | — |
| ANSWERING | end | — | ENDED | 先 `closeQuestion(ACTIVITY_ENDED)` |
| ANSWERING | 伺服器重啟 | — | WAITING | Q.round−1；有有效結果 → CLOSED，否則 NOT_OPENED；notice |

### 2.2 活動題目（`questions.status`）

`NOT_OPENED → ANSWERING → CLOSED → (reopen) ANSWERING → CLOSED …`；重啟時 `ANSWERING → NOT_OPENED 或 CLOSED`（R5）。

---

## 3. 共用型別（`shared/src/activity.ts`）

```ts
type StudentPhase = ActivityPhase | 'NO_ACTIVITY';
type TeacherPhase = ActivityPhase | 'NONE';
type ActivityQuestionStatus = 'NOT_OPENED' | 'ANSWERING' | 'CLOSED';
type ClosedReason = 'TIME_UP' | 'MANUAL' | 'ACTIVITY_ENDED';

interface PartAnswer { partIndex: number; partLabel: string | null; answer: string }

interface QuestionListItem {
  questionId: string; label: string; position: number; kind: 'SINGLE' | 'GROUP';
  summary: string;              // 題目文字摘要（前 40 字）
  status: ActivityQuestionStatus; round: number;
  winnerTeamName: string | null; // CLOSED 時；null 且 CLOSED → 「無人送出」
  stem: string | null;           // 開放前預覽完整題目（US2-1）
  parts: { partIndex: number; partLabel: string | null; text: string }[];
}

interface ActivityQuestionDetail {
  questionId: string; label: string; kind: 'SINGLE' | 'GROUP'; stem: string | null;
  parts: { partIndex: number; partLabel: string | null; text: string }[];
}

interface MonitorTeamRow {
  teamId: string; teamName: string;
  submitted: boolean; rank: number | null; elapsedSeconds: number | null;
  submitterName: string | null; answers: PartAnswer[] | null;
  online: number; members: number;
}

interface MonitorView {
  questionId: string; round: number; submittedCount: number; teamCount: number;
  allSubmitted: boolean; teams: MonitorTeamRow[];   // 已送出依 rank，其後未送出依組號
}

interface ResultBoardView {
  question: ActivityQuestionDetail; round: number; closedReason: ClosedReason;
  rows: MonitorTeamRow[];        // 已送出依 rank（rank 1 = 搶答成功），其後未送出
  noSubmission: boolean;
}

interface TeacherActivityView {
  phase: TeacherPhase; serverNow: string;
  activity: { id: string; sourceTitle: string | null; startedAt: string | null } | null;
  readiness: { questionCount: number; sourceTitle: string | null;
               teams: { teamId: string; name: string; members: number }[] } | null; // 只在 NONE/ENDED
  questions: QuestionListItem[];
  progress: { closed: number; total: number };
  current: ActivityQuestionDetail | null;
  endsAt: string | null;          // ANSWERING
  monitor: MonitorView | null;    // ANSWERING
  result: ResultBoardView | null; // CLOSED
  preselectedQuestionId: string | null;
  notice: string | null;
}
```

學生視角（`StudentView`，002）變更：`phase: StudentPhase`；`question` 增加 `kind`、`stem`、`parts`；`myTeamSubmission` 改為 `{ answers: PartAnswer[] }`；`results[].answers: PartAnswer[]`（保留 `answer` 合併文字）。不增加任何監控欄位。

---

## 4. 驗證規則（共用，前後端一致）

| 輸入 | 規則 | 錯誤碼 / 訊息 |
|------|------|---------------|
| `seconds` | 必須是 JSON number、整數、5 ≤ s ≤ 600；省略時 60 | `INVALID_SECONDS`「作答秒數須為 5～600 的整數」 |
| `questionId` | 字串、去除空白後 1～64 字元、屬於目前活動 | `VALIDATION_ERROR`／`QUESTION_NOT_FOUND` |
| `confirm`（reopen） | 必須為 `true` | `REOPEN_NOT_CONFIRMED` |
| `answers` | 陣列、長度＝小題數 | `PART_COUNT_MISMATCH` |
| `answers[i]` | 去除前後空白後 1～500 字（code point） | `PART_ANSWER_EMPTY`／`PART_ANSWER_TOO_LONG`，`field: answers[i]`，訊息含小題標籤 |
| `answer`（相容） | 只接受單題；規則同 002 | `EMPTY_ANSWER`／`ANSWER_TOO_LONG` |
