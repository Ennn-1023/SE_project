# Quickstart：學生作答頁倒數計時與最後十秒變色提醒

本文件是驗證指南：說明怎麼跑自動化測試，以及怎麼手動走過 spec 的驗收情境。畫面合約見 [contracts/ui-countdown.md](contracts/ui-countdown.md)，階段規則見 [data-model.md](data-model.md)。

## 1. 前置條件與指令

- Node.js 24 以上，已在專案根目錄執行 `npm install`。
- `.env` 依 `.env.template` 填寫。本功能**不需要新的環境變數**。
- 已有 001 的老師帳號（`npm run seed -w backend`），以及至少一位已分組的虛構學生。
- 已有一份已匯入題目的題目集（003）。

全部測試：

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

## 2. 自動化測試對照（憲章原則 IV、V）

```bash
npm run test -w frontend -- countdownPhase CountdownTimer AnsweringView MonitorBoard style useServerCountdown
```

```bash
npm run test -w backend -- tests/architecture/diagram-consistency
```

| spec 項目 | 正常案例 | 邊界案例 | 測試檔 |
|-----------|----------|----------|--------|
| US1／FR-001～004 | 依 `endsAt` 倒數，並以 mm:ss 顯示 | 裝置時鐘誤差；不足 1 秒時無條件進位；歸零後不會出現負數 | `useServerCountdown`（既有） |
| US2／FR-005、006 | 15 秒的題目在 `00:11` 時是 normal，到 `00:10` 時切換為 urgent | 11／10／1／0 秒；10.4 秒（顯示 `00:11`）仍是 normal；沒有 `endsAt` | `countdownPhase`、`CountdownTimer` |
| FR-007、008 | 老師看板與學生頁在相同 `endsAt` 下的 `data-phase` 相同 | `.countdown-urgent` 使用 `--color-accent`，`.countdown-value` 使用 `--color-primary` | `MonitorBoard`、`style` |
| FR-009 | 歸零後顯示「時間到，等待結果」，階段為 expired | — | `CountdownTimer` |
| FR-010 | — | 載入時剩 3 秒，直接是 urgent；5 秒的題目從一開始就是 urgent | `CountdownTimer` |
| FR-011 | 本組送出後，倒數仍在 `.answering-head` 內 | — | `AnsweringView` |
| FR-012 | `.answering-head` 為 sticky，且有不透明背景 | 斷線提示列出現時的偏移；作答欄位有 `scroll-margin-top` | `style` |
| 憲章 VI | 007 組件圖與類別圖都有對應的程式碼 | — | `diagram-consistency` |

## 3. 手動驗證情境

先啟動開發環境：

```bash
npm run dev
```

準備兩個視窗：視窗 A 以老師帳號開「搶答活動」，視窗 B 以學生帳號開 `/student/buzzer`。

1. **深藍轉橘（SC-001、SC-003）**
   - 老師以 15 秒開始一題。學生頁在 `00:15`～`00:11` 期間數字為深藍色，顯示 `00:10` 時立刻變成橘色，一直到歸零。
   - 同時看老師看板，兩邊應在同一秒變色，顏色肉眼比對相同。
   - 重複 10 次，記錄每次 `00:10` 與 `00:11` 的顏色。
2. **重新整理（SC-002、FR-010）**
   - 老師以 60 秒開始一題。約 20 秒後重新整理學生頁，剩餘時間應約為 `00:40`，深藍色。
   - 剩約 3 秒時再重新整理一次，一出現就應是橘色。
3. **最短時間**：老師以 5 秒開始一題，學生頁從一開始就是橘色。
4. **歸零**：倒數歸零後，應顯示「時間到，等待結果」，接著切換到結果畫面。
5. **送出後（FR-011）**：學生送出答案後，「本組已送出」出現，倒數仍繼續進行並照常變色。
6. **捲動固定（SC-004、FR-012）**
   - 以瀏覽器的裝置模擬設為 375×667，老師開一題有多個小題的題組。
   - 學生頁捲到最底部，題號與剩餘時間應一直固定在畫面頂端，而且不透出下方文字。
   - 點最下方小題的作答欄位，欄位應完整出現在倒數列下方，不被遮住。
   - 換成電腦寬度（1280×800），重複一次。
   - 換成短題目（不需捲動），外觀應與修改前相同。
7. **斷線時的堆疊**：在開發者工具把網路切到 Offline。斷線提示列出現後，捲動時倒數列應固定在提示列的正下方，兩者不重疊。恢復連線後，倒數列回到最頂端。
8. **老師端不變（SC-003）**：老師看板的倒數外觀、位置與修改前相同，不會變成固定在頂端。

## 4. 完成回報格式

回報時附上以下內容：

- `npm test`、`npm run typecheck`、`npm run lint` 的實際輸出摘要，包括 shared、backend、frontend 各自的通過數。
- 手動驗證第 1～8 步的結果，以及第 6 步在 375px 下的截圖。
- 設計圖一致性驗證結果（憲章原則 VI）。
