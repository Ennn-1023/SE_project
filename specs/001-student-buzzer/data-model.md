# Data Model: 學生端搶答系統（001-student-buzzer）

對應 spec 的 Key Entities 與 [diagrams/student-class.png](../../diagrams/student-class.png)。
「儲存位置」標示資料放在 SQLite（持久）或記憶體（重啟即消失）。

## 1. Activity（活動）— SQLite `activities`

| 欄位 | 型別 | 規則 |
|------|------|------|
| `id` | TEXT PK | 同一時間只有一筆 `phase != 'ENDED'` 的活動（FR-020b） |
| `phase` | TEXT | `WAITING` \| `ANSWERING` \| `CLOSED` \| `ENDED` |
| `current_question_id` | TEXT NULL | `ANSWERING`、`CLOSED` 時必填；`WAITING`、`ENDED` 時為 NULL |
| `ends_at` | INTEGER NULL | epoch ms；只有 `ANSWERING` 時有值 |
| `updated_at` | INTEGER | epoch ms |

### 狀態轉換

```text
           open(q, s)            timeUp / manualClose
WAITING ───────────────▶ ANSWERING ─────────────────▶ CLOSED
   ▲                                                   │
   └───────────────────── nextQuestion ────────────────┘
任一非 ENDED 階段 ── endActivity ──▶ ENDED（正式流程的終態）
任一階段（含 ENDED）── reset（僅 dev）──▶ WAITING（清除本活動所有結果）
啟動恢復：讀到 ANSWERING ──▶ WAITING（捨棄該題送出，FR-020a）
```

| 操作 | 允許的起始階段 | 拒絕時的錯誤碼 |
|------|----------------|----------------|
| `open(questionId, seconds)` | `WAITING` | `INVALID_SECONDS`、`QUESTION_NOT_FOUND`（先驗證輸入）；`ACTIVITY_ENDED`（ENDED 時）；`INVALID_TRANSITION`（作答中或已結束時，例如作答中再開放一題）；`QUESTION_ALREADY_CLOSED` |
| `timeUp()`／`manualClose()` | `ANSWERING` | `ACTIVITY_ENDED`（ENDED 時）；其他階段 `INVALID_TRANSITION` |
| `nextQuestion()` | `CLOSED` | `ACTIVITY_ENDED`（ENDED 時）；其他階段 `INVALID_TRANSITION` |
| `endActivity()` | `WAITING`、`ANSWERING`、`CLOSED` | `ACTIVITY_ENDED` |
| `reset()`（僅 dev） | 任何階段，包含 `ENDED` | —（`ENABLE_DEV_TOOLS=false` 時路由不存在，回 404） |

- 活動進入 `ENDED` 後，除了 dev 的 `reset()` 之外，所有操作一律回 `ACTIVITY_ENDED`，訊息比 `INVALID_TRANSITION` 更明確。
- `reset()` 是唯一能離開 `ENDED` 的操作，只供開發與測試使用：取消計時器、清空記憶體中的送出、刪除本活動所有 `submissions` 與 `question_results`，然後回到 `WAITING`。
- 內部的 `closeQuestion()` 具冪等性：如果已經不是 `ANSWERING` 就直接返回，因此計時器與手動結束同時觸發時只會結束一次。
- 在 `ANSWERING` 時執行 `endActivity()`：先結束目前題目（產生結果），再進入 `ENDED`。
- 已經有 `QuestionResult` 的題目不可以再次開放（`QUESTION_ALREADY_CLOSED`）；作答中因重啟而作廢的題目沒有結果，所以可以重新開放。

## 2. Question（題目）— SQLite `questions`（由 mock seed 寫入）

| 欄位 | 型別 | 規則 |
|------|------|------|
| `question_id` | TEXT PK | 非空，同一活動內唯一 |
| `activity_id` | TEXT FK | |
| `number` | INTEGER | ≥ 1，同一活動內唯一（題號） |
| `text` | TEXT | 非空 |

## 3. Team（組別）— SQLite `teams`

| 欄位 | 型別 | 規則 |
|------|------|------|
| `team_id` | TEXT PK | |
| `activity_id` | TEXT FK | |
| `name` | TEXT | 非空，例如「第 1 組」 |

## 4. Student（學生）— SQLite `students`

| 欄位 | 型別 | 規則 |
|------|------|------|
| `student_id` | TEXT PK | 學號，虛構資料 |
| `name` | TEXT | 非空 |
| `team_id` | TEXT FK NULL | NULL 表示未分組，送出時回 `NO_TEAM`（403） |

預設每組只有 1 位登入者；mock 資料另外提供 1 組有 2 位學生，以及 1 位未分組的學生（FR-021、邊界測試用）。

## 5. Submission（送出紀錄）

- **作答中**：存放在記憶體 `Map<teamId, Submission>`（屬於目前題目）。
- **題目結束時**：以交易寫入 SQLite `submissions`。

| 欄位 | 型別 | 規則 |
|------|------|------|
| `activity_id` | TEXT | |
| `question_id` | TEXT | 必須是目前開放的題目（否則回 `QUESTION_NOT_OPEN`） |
| `team_id` | TEXT | 由伺服器依 token 查出，不接受前端傳入 |
| `student_id` | TEXT | 送出者 |
| `answer` | TEXT | 去除前後空白後 1–500 code points |
| `received_at` | INTEGER | 伺服器 epoch ms |
| `rank` | INTEGER | 從 1 開始，同一題內唯一 |

**限制**：`UNIQUE(activity_id, question_id, team_id)`、`UNIQUE(activity_id, question_id, rank)`。記憶體中的 Map 已經先擋下重複送出，資料庫的唯一限制是第二道防線。

## 6. QuestionResult（題目結果）— SQLite `question_results`

| 欄位 | 型別 | 規則 |
|------|------|------|
| `activity_id` | TEXT | |
| `question_id` | TEXT | PK（與 activity_id 組成複合主鍵）；每題至多一筆 |
| `answer` | TEXT NULL | rank 1 的答案；沒有任何組送出時為 NULL |
| `winner_team` | TEXT NULL | rank 1 的 team_id |
| `submitted_at` | INTEGER NULL | rank 1 的 `received_at`（epoch ms；API 輸出時轉為 ISO 8601） |
| `closed_reason` | TEXT | `TIME_UP` \| `MANUAL` \| `ACTIVITY_ENDED` |
| `closed_at` | INTEGER | |

與 `submissions` 在**同一個交易**中寫入（FR-019、FR-020）。

## 7. StudentView（學生視角）— 不儲存，每次由 `buildView(activity, teamId)` 產生

| 欄位 | 出現時機 | 說明 |
|------|----------|------|
| `phase` | 永遠 | |
| `serverNow` | 永遠 | 用來校正前端時鐘 |
| `question` `{ questionId, number, text }` | `ANSWERING`、`CLOSED` | |
| `endsAt` | `ANSWERING` | ISO 8601 |
| `myTeam` `{ teamId, name }` \| null | 永遠 | null 表示未分組 |
| `myTeamSubmission` `{ answer }` \| null | `ANSWERING`、`CLOSED` | **只包含本組資料** |
| `results` `TeamAnswer[]` | 只有 `CLOSED` | 依 rank 排序 |
| `myTeamOutcome` | 只有 `CLOSED` | `WIN` \| `LOSE` \| `NOT_SUBMITTED` |

**TeamAnswer** = `{ rank, teamName, answer, isWinner }`。依釐清結果 Q4，**不包含**送出時間與送出者。

**隔離不變式（以單元測試保證）**：當 `phase !== 'CLOSED'` 時，`StudentView` 序列化後的內容中不會出現任何其他組別的 `teamId`、`teamName` 或答案。
