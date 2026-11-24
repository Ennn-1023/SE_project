# REST API Contract（002-student-buzzer）

- Base path：`/api`
- 所有回應皆為 JSON（UTF-8），時間欄位為 ISO 8601。
- 學生 API 以 001 的登入 session 驗證（HttpOnly cookie `sid`，由 `POST /api/auth/login` 取得，見 [001 openapi.yaml](../../001-foundation-auth-groups/contracts/openapi.yaml)），且只限學生角色：未登入或 session 失效回 401 `UNAUTHENTICATED`，老師呼叫回 403 `FORBIDDEN`。
- 學生的組別由伺服器依 001 的組別指派查出（`teamId = T{組別編號}`），不接受前端傳入。
- 錯誤格式與 001 共用：搶答錯誤碼的 `field` 一律存在（可為 null）；001 的錯誤（例如 401／403／404）沒有 `field` 時省略。

## 錯誤格式（所有錯誤共用）

```json
{ "error": { "code": "ANSWER_TOO_LONG", "field": "answer", "message": "答案最多 500 字，目前 523 字", "hint": "請精簡後再送出" } }
```

`field` 在與特定欄位無關時為 `null`。回應中不得包含 stack trace 或機敏資料。

## 錯誤碼表

| code | HTTP | field | message | hint |
|------|------|-------|---------|------|
| `VALIDATION_ERROR` | 400 | 出錯欄位；body 不是 JSON 物件時為 `body` | 一律中文，例如「{欄位} 為必填」「{欄位} 必須是文字」「{欄位} 不可為空」「{欄位} 最多 64 字元」「請求內容必須是 JSON 物件」；不回傳 zod 的英文訊息 | 依欄位說明修正方式，例如「請提供 {欄位}」「請以文字格式送出 {欄位}」 |
| `EMPTY_ANSWER` | 400 | `answer` | 答案不可為空 | 請輸入內容後再送出 |
| `ANSWER_TOO_LONG` | 400 | `answer` | 答案最多 500 字，目前 N 字 | 請精簡後再送出 |
| `UNAUTHORIZED` | 401 | null | 尚未登入或登入已過期 | 請重新登入 |
| `NO_TEAM` | 403 | null | 你尚未被分配到組別 | 請聯絡老師 |
| `QUESTION_NOT_FOUND` | 404 | `questionId` | 找不到此題目 | 請確認題目編號 |
| `NOT_FOUND` | 404 | null | 找不到此路徑 | 請確認網址是否正確 |
| `QUESTION_NOT_OPEN` | 409 | `questionId` | 此題目目前未開放作答 | 請等待老師開放題目 |
| `QUESTION_CLOSED` | 409 | null | 本題搶答已結束，無法再送出答案 | 請查看本題結果 |
| `ALREADY_SUBMITTED` | 409 | null | 本組已送出過此題答案，每組每題只能送出一次 | 送出後不可修改 |
| `ACTIVITY_ENDED` | 409 | null | 活動已結束 | 感謝參與 |
| `INVALID_TRANSITION` | 409 | null | 目前階段（{phase}）不能執行「{操作}」 | 依說明列出允許的階段 |
| `QUESTION_ALREADY_CLOSED` | 409 | `questionId` | 此題已結束，不能再次開放 | 請選擇其他題目 |
| `INVALID_SECONDS` | 400 | `seconds` | 作答秒數必須是 5–600 的整數 | 例如 60 |
| `INTERNAL_ERROR` | 500 | null | 系統發生錯誤，請稍後再試 | 若持續發生請通知老師 |

`ENABLE_DEV_TOOLS=false` 時不會掛載 `/api/dev/*` 路由，請求會得到與一般不存在路徑相同的 404 `NOT_FOUND`，不另外定義錯誤碼。

**送出時的判定順序**（決定回傳哪個錯誤碼）：
1. 未驗證 → 401
2. 未分組 → 403
3. body 驗證失敗（`EMPTY_ANSWER`／`ANSWER_TOO_LONG`／`VALIDATION_ERROR`）→ 400
4. 活動已結束 → `ACTIVITY_ENDED`
5. 送出的 questionId 是剛結束的題目，且階段為 `CLOSED` → `QUESTION_CLOSED`
6. questionId 不是目前開放的題目 → `QUESTION_NOT_OPEN`
7. 本組已送出 → `ALREADY_SUBMITTED`

---

## 學生 API

### `GET /api/student/state`

取回目前的學生視角（重新整理、重連、晚加入時使用）。

- **200**：`StudentView`（見 [data-model.md §7](../data-model.md)）
- **401**：`UNAUTHORIZED`

```json
{
  "phase": "ANSWERING",
  "serverNow": "2026-11-20T02:15:20.120Z",
  "question": { "questionId": "Q1", "number": 1, "text": "請說明 TCP 三向交握" },
  "endsAt": "2026-11-20T02:16:00.000Z",
  "myTeam": { "teamId": "T1", "name": "第 1 組" },
  "myTeamSubmission": null
}
```

### `POST /api/student/submissions`

以所屬組別送出目前題目的答案。

- **Request**：

  ```json
  { "questionId": "Q1", "answer": "SYN → SYN-ACK → ACK" }
  ```

  | 欄位 | 規則 |
  |------|------|
  | `questionId` | 必填字串，長度 1–64 |
  | `answer` | 必填字串；去除前後空白後 1–500 code points；儲存的是去除前後空白後的內容 |

- **201**：`{ "questionId": "Q1", "teamId": "T1", "answer": "SYN → SYN-ACK → ACK" }`
  - 回應**不含** `rank`，避免作答中透露有多少組已經送出（FR-015）。
- **錯誤**：400／401／403／409，見錯誤碼表。

成功後，伺服器會對目前屬於該組的連線推播 `state:update`（見 socket-events.md）。

---

## Dev API（僅 `ENABLE_DEV_TOOLS=true` 時掛載；否則回 404）

> 整合 001 後已移除 `GET /api/dev/students` 與 `POST /api/dev/login`（mock 登入），學生改以 001 帳號登入。
> 以下 dev API 需以**老師**身分登入（未登入 401、學生 403）。

### `GET /api/dev/teacher/status`

模擬老師面板使用：回傳目前階段與題目清單。

- **200**：

  ```json
  {
    "phase": "ANSWERING",
    "currentQuestionId": "Q1",
    "endsAt": "2026-11-20T02:16:00.000Z",
    "questions": [{ "questionId": "Q1", "number": 1, "text": "請說明 TCP 三向交握的三個步驟。" }]
  }
  ```

  `currentQuestionId`、`endsAt` 在沒有對應值時為 `null`；`questions` 依題號排序。

### 模擬老師操作 `POST /api/dev/teacher/*`

成功時皆回 **200** `{ "phase": "...", "currentQuestionId": "...|null", "endsAt": "...|null" }`。

| 路徑 | Body | 說明 |
|------|------|------|
| `/api/dev/teacher/open` | `{ "questionId": "Q1", "seconds": 60 }`（`seconds` 選填，預設 60，必須是 5–600 的整數） | 開放題目 |
| `/api/dev/teacher/time-up` | — | 立即觸發時間到 |
| `/api/dev/teacher/close` | — | 手動結束 |
| `/api/dev/teacher/next` | — | 從 CLOSED 回到 WAITING |
| `/api/dev/teacher/end` | — | 結束整場活動 |
| `/api/dev/teacher/reset` | — | 重設為 WAITING 並清除所有結果（僅開發與測試用） |

### `GET /api/dev/results`

回傳本活動所有題目的結果（FR-019）：

```json
[{ "question_id": "Q1", "answer": "SYN → SYN-ACK → ACK", "winner_team": "T2", "submitted_at": "2026-11-20T02:15:31.482Z" }]
```

無人送出的題目：`answer`、`winner_team`、`submitted_at` 皆為 `null`。

### `GET /api/dev/submissions?questionId=Q1`

回傳該題所有已持久化的送出紀錄（含 rank、student_id、received_at）。供日後老師端功能與測試驗證使用（FR-020）；**不對學生開放**。
