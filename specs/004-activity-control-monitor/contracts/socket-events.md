# Socket.IO 事件合約（F5/F8，擴充 002）

沿用 002 [`socket-events.md`](../../002-student-buzzer/contracts/socket-events.md)：只有伺服器 → 客戶端推播；連線以 `sid` session cookie 驗證；連線（含重連）成功後立即送一次完整狀態；重連參數 `SOCKET_RECONNECT_OPTIONS`（shared）。

伺服器設定：`pingInterval: 4000`、`pingTimeout: 5000`（research R10，在線狀態 10 秒內反映）。

## Namespace `/teacher`（新增）

| 項目 | 內容 |
|------|------|
| 驗證 | session 有效且角色為 `TEACHER`；否則連線被拒，`err.data` 為 `ErrorResponse.error`（`UNAUTHENTICATED`／`FORBIDDEN`） |
| 事件 | `teacher:update` |
| Payload | `TeacherActivityView`（[data-model.md §3](../data-model.md)），與 `GET /api/teacher/activity` 完全相同 |
| 觸發 | (1) 連線成功；(2) 狀態機 `onChange`（開始、開放、重新開放、結束、回到等待、結束活動、時間到）；(3) 送出被接受；(4) 學生在線人數變化（節流 300 ms） |
| 延遲目標 | (2)(3) 觸發後 1 秒內送達（SC-002、SC-003） |

## Namespace `/student`（002，變更）

| 變更 | 說明 |
|------|------|
| `state:update.phase` | 新增 `NO_ACTIVITY`（從未開始過任何活動） |
| `state:update.question` | 新增 `kind`、`stem`、`parts[{partIndex, partLabel, text}]` |
| `myTeamSubmission` | 改為 `{ answers: PartAnswer[] }` |
| `results[]` | 新增 `answers: PartAnswer[]`（保留合併文字 `answer`） |
| 在線追蹤 | 伺服器依 `studentId` 記錄連線集合，連線／斷線時觸發 `/teacher` 推播 |

**隔離不變式（FR-021、SC-006）**：`/student` 的任何 payload 不得含 `MonitorView`、`elapsedSeconds`、`submitterName`、在線人數，或作答中他組的任何資料。`monitor.isolation.test.ts` 會攔截所有學生端事件逐一檢查。

## 推播順序

1. 送出被接受 → `pushToTeam(teamId)`（學生）→ `pushTeachers()`。
2. 題目結束 → `ResultService.finalize`（交易）→ `pushAll()`（學生）→ `pushTeachers()`。
3. 老師的 REST 回應與 `teacher:update` 內容相同；前端以 `serverNow` 較新者為準，避免舊推播覆蓋新回應。
