# Socket.IO Events Contract（002-student-buzzer）

- Namespace：`/student`
- 方向：**只有伺服器 → 學生推播**。送出與取回狀態一律走 REST（見 [rest-api.md](rest-api.md)）。

## 連線與驗證

```ts
io('/student', { auth: { token: '<jwt>' } })
```

- handshake middleware 會驗證 token：
  - 不合法或過期時，以 `connect_error` 拒絕，`err.message = "UNAUTHORIZED"`，`err.data = { code, message, hint }`（與 REST 錯誤內容相同）。
- 驗證成功後，伺服器依 token 查出學生，並加入 room：
  - 有組別：`team:{teamId}`
  - 未分組：`student:{studentId}`
- 連線成功後，伺服器**立刻**對該 socket 發送一次 `state:update`，內容為目前的 StudentView。前端也可以再呼叫 `GET /api/student/state` 作為保險。

## 伺服器 → 學生事件

### `state:update`

Payload：`StudentView`（見 [data-model.md §7](../data-model.md)）。

**觸發時機**：

| 時機 | 送給誰 |
|------|--------|
| 階段轉換（open／close／next／end／reset） | 每個 `team:*` 與 `student:*` room 各自呼叫 `buildView` 後**分開送出** |
| 某組送出成功 | 只送給 `team:{teamId}`，讓同組的其他分頁或裝置看到「本組已送出」 |
| socket 剛連線 | 只送給該 socket |

**禁止事項**（以整合測試驗證）：
- 不得使用 `io.of('/student').emit(...)` 對所有人廣播含有 `myTeamSubmission` 或 `results` 的 payload。
- 在 `ANSWERING` 階段，任何 socket 收到的 payload 都不得包含其他組別的資料。

## 重連行為

- 使用 socket.io-client 內建的自動重連，設定共用 `shared/src/realtime.ts` 的 `SOCKET_RECONNECT_OPTIONS`：`reconnectionDelay: 500`、`reconnectionDelayMax: 2000`、`randomizationFactor: 0.2`。網路恢復後最多約 2.4 秒就會重試，加上取回狀態，可在 3 秒內回到正確畫面（SC-006）。
- 瀏覽器發出 `online` 事件（網路恢復）且尚未連線時，前端立即呼叫 `socket.connect()`，不等待退避計時。
- 前端在 `disconnect` 時顯示 ConnectionBanner「連線中斷，正在重新連線…」，並停用送出按鈕（FR-005）。
- `connect`（包含重連）後會收到 `state:update`，畫面以這份資料取代目前狀態。上一題的本地狀態（作答區草稿、已送出標記）在 `question.questionId` 改變或 `phase` 為 `WAITING` 時清除。
