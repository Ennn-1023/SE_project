# Quickstart：活動管理與逐題開放控制＋老師即時監控看板（F5＋F8）

本文件是驗證指南：說明如何設定、執行自動化測試，以及手動走過 spec 的驗收情境。API 與畫面細節見 [contracts/](contracts/)，資料表見 [data-model.md](data-model.md)。

## 1. 前置條件

- Node.js ≥ 24，已在根目錄執行 `npm install`。
- `.env` 依 `.env.template` 填寫（本功能**不需要新的環境變數**）。手動驗證時建議 `ENABLE_DEV_TOOLS=true`，可用 dev 面板快速建立學生與 mock 活動。
- 已有 001 老師帳號（`npm run seed -w backend`）。
- 手動驗證 Google 匯入路徑時需 003 的 `GOOGLE_*` 設定；不想連 Google 時改用 §3.0 的 mock 活動。

## 2. 自動化測試（憲章原則 IV、V）

```bash
npm test
```

分區執行：

```bash
npm run test -w shared -- activity
```

```bash
npm run test -w backend -- tests/unit/activityStateMachine tests/unit/resultService tests/unit/submissionService tests/unit/monitorViewBuilder tests/unit/activityLockGuard
```

```bash
npm run test -w backend -- tests/integration/activity tests/integration/monitor tests/integration/presence
```

```bash
npm run test -w frontend -- ActivityControlPage OpenQuestionForm MonitorBoard ResultBoard ActivityQuestionList AnsweringView ResultView narrowScreen
```

```bash
npm run test -w backend -- tests/architecture/diagram-consistency
```

另需通過 `npm run typecheck` 與 `npm run lint`。完成回報須附上實際執行的指令與通過／失敗數量。

| 測試群組 | 覆蓋的 spec 項目 |
|----------|------------------|
| `activity.start` | US1-1～4、US1-6、FR-001～FR-003 |
| `activity.open` | US2-1～3、US2-6～7、US2-10（秒數邊界 4／5／600／601／0／-1／60.5／"60"／空白）、FR-007～FR-009、FR-012～FR-014 |
| `activity.close` | US2-4～5、FR-010～FR-011（時間到與手動結束同時 100 次，SC-004） |
| `activity.reopen` | US2-8～9、FR-007a、SC-011 |
| `activity.end` | US5-1～4 |
| `activity.lock` | US1-5、FR-005、FR-006、Edge「作答中改組」 |
| `activity.auth` | US1-7、FR-027（學生 403、未登入 401、學生 socket 連 `/teacher` 被拒） |
| `activity.restart` | US5-6、FR-026、Edge「重新開放後重啟」 |
| `monitor.sync` | US3-1～4、US3-7、SC-002、SC-003（10 組同時送出、2 個老師連線） |
| `monitor.isolation` | US3-5、FR-021、SC-006 |
| `submit.parts` | FR-030a/b、SC-010、Edge「題組某小題空白」 |
| `presence` | US6、FR-022 |
| 前端元件測試 | US3-6 提醒、US4、FR-020、FR-025、FR-033、SC-009 |

## 3. 手動驗證情境

啟動：

```bash
npm run dev
```

開三個瀏覽器視窗：老師（桌機寬）、老師第二個分頁、學生 A／B（可用無痕視窗，或瀏覽器開發者工具模擬 375 px）。

### 3.0 準備資料

1. 老師登入 → 學生帳號管理建立 4 位虛構學生 → 組別管理設 4 組並各指派 1 人。
2. 題目：以 003 匯入題組範例學習單（4 題、含 2 個題組）；或在 dev 面板按「以 mock 題目開始活動」（跳過 3.1）。

### 3.1 開始活動（US1）

1. 學生先開搶答頁 → 顯示「目前沒有進行中的活動，請等待老師開始」。
2. 老師首頁 →「搶答活動」→ 看到題目集來源、4 題、4 組與人數 → 按「開始活動」。
3. 預期：題目清單 4 題皆「未開放」；學生 1 秒內變為「等待老師開放題目」。
4. 到題目管理按「清除題目集」→ 預期 409「搶答活動進行中，無法變更題目集；請先結束活動」。

### 3.2 開放、監控、手動結束（US2、US3、US4）

1. 選第 1 題（題組），秒數改為 `4` → 預期提示「作答秒數須為 5～600 的整數」；改回 `60` → 「開始搶答」。
2. 預期：老師看板 60 秒倒數、「已送出 0／4 組」、頂端提醒「請勿投影給學生」；學生畫面顯示共同題幹與 2 個作答框。
3. 學生 B 只填第（1）小題送出 → 預期「第（2）小題答案不可為空」。兩題都填後送出。
4. 預期：兩個老師分頁 1 秒內顯示 B 組「第 1 名、目前最快、開放後 x.x 秒、送出者、（1）（2）答案」。學生 A 畫面看不到 B 組任何資訊。
5. 在作答中到組別管理改某學生組別 → 預期 409「搶答作答中，請於本題結束後再調整組別」。
6. 老師按「結束搶答」→ 確認 → 預期結果看板依順位、B 組「搶答成功」、未送出組列在下方、結束原因「手動結束」；學生看到全部答案（依小題）。

### 3.3 直接開放下一題、時間到、回顧（US2、US4）

1. 結果畫面已預選第 2 題 → 秒數 `5` → 開始搶答 → 不操作等待。
2. 預期：學生由第 1 題結果直接切到第 2 題作答；5 秒後自動結束（原因「時間到」），看板「本題無組別送出答案」。
3. 在題目清單點第 1 題 → 對話框顯示第 1 題結果（唯讀），目前階段不變。

### 3.4 重新開放（US2-8、US2-9）

1. 在第 1 題結果對話框按「重新開放」→ 確認視窗顯示「會取代第 1 題目前的結果（第 2 組搶答成功）」→ 確定，秒數 60。
2. 預期：各組可重新送出、看板從 0／4 開始。讓 A 組送出後手動結束。
3. 預期：第 1 題結果只剩新一輪（A 組成功）；dev 結果 API `GET /api/dev/results` 只列有效結果；資料庫 `submissions` 仍保留 round 1 且 `voided = 1`。

### 3.5 重新整理、斷線、重啟（US5）

1. 開放第 3 題 → 老師按 F5 → 預期 3 秒內回到監控看板，剩餘時間與另一分頁相差 ≤ 1 秒。
2. 關閉網路 5 秒再開 → 斷線期間按鈕停用並顯示「連線中斷…」，恢復後狀態正確。
3. 作答中停止並重啟後端 → 預期活動回「等待開放」、第 3 題「未開放」、看板提示「伺服器重新啟動，第 3 題作答已取消，可重新開放」。

### 3.6 在線狀態（US6）

學生 A 開兩個分頁 → 看板 A 組「在線 1／1」；關閉兩個分頁 → 10 秒內變「離線」。

### 3.7 結束活動（US5-1～4）

1. 按「結束活動」→ 確認視窗提示「尚有 N 題未開放…」→ 確定。
2. 預期：學生顯示「活動已結束，感謝參與」；老師看到摘要；題目管理可再次匯入。
3. 按「開始新活動」→ 新的一場從題目清單全部「未開放」開始，上一場結果不出現。

### 3.8 版面（SC-009）

在 375 px 與 1440 px 下檢查活動頁：無水平捲動；10 組時看板可完整捲動；所有按鈕觸控區 ≥ 44 px。

## 4. 設計圖一致性（憲章原則 VI）

實作完成後：

```bash
java -jar plantuml.jar "./diagrams/*.puml"
```

並執行 §2 的 `diagram-consistency` 測試；時序圖（`004-sequence-question`、`004-sequence-lifecycle`）的呼叫順序依 §3.2～§3.7 手動比對，結果記錄於 `specs/004-activity-control-monitor/diagram-verification.md`。
