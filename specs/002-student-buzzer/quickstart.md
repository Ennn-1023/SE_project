# Quickstart & Validation Guide（002-student-buzzer）

本文件說明如何啟動學生端搶答系統，並用 mock 與模擬老師操作逐一驗證規格。
API 細節見 [contracts/rest-api.md](contracts/rest-api.md) 與 [contracts/socket-events.md](contracts/socket-events.md)；資料規則見 [data-model.md](data-model.md)。

## 1. 前置需求

- **Node.js 22 以上**（開發時使用 Node 26 LTS，含 npm 11）。可以用以下指令安裝：

  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```

- 安裝完成後重新開啟終端機，確認版本：

  ```powershell
  node -v
  ```

## 2. 設定環境變數

1. 複製範本：

   ```powershell
   Copy-Item .env.template .env
   ```

2. 在 `.env` 填入：
   - `SESSION_SECRET`：至少 32 字元的隨機字串，例如用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 產生。
   - `ENABLE_DEV_TOOLS=true`
   - 其他變數見 [research.md R11](research.md)。

`.env` 已列入 `.gitignore`，不可提交（憲章原則 III）。

## 3. 安裝與啟動

```powershell
npm install
```

```powershell
npm run dev
```

- `npm run dev` 會同時啟動後端（http://localhost:3000）與前端（http://localhost:5173）。
- 第一次啟動時會自動建立 SQLite 資料庫，並寫入 mock 資料：3 題題目、4 組（其中 1 組有 2 位學生）、1 位未分組學生。
- 如果缺少 `SESSION_SECRET`，後端會顯示「缺少必要環境變數：SESSION_SECRET」並停止。

## 4. 自動化測試（憲章原則 IV、V）

| 範圍 | 指令 |
|------|------|
| 全部 | `npm test` |
| 只跑後端 | `npm run test -w backend` |
| 只跑前端 | `npm run test -w frontend` |
| shared 規則 | `npm run test -w shared` |

完成實作時，必須回報實際執行的指令與「通過／失敗數量」；失敗時附上錯誤摘要。

### 必須涵蓋的測試清單

| # | 類型 | 情境 | 對應 |
|---|------|------|------|
| T1 | 正常 | 開放題目 → 送出成功 → 同組其他分頁收到「本組已送出」 | US1、FR-006、FR-008 |
| T2 | 正常 | B、A、C 依序送出 → 結束 → 每位學生都看到順位 1/2/3，只有 B 是 WIN | US2、FR-009、FR-017 |
| T3 | 正常 | 結束後產生一筆 QuestionResult（question_id、answer、winner_team、submitted_at） | FR-019 |
| T4 | 邊界 | 答案為空字串、只有空白 → 400 `EMPTY_ANSWER` | FR-012 |
| T5 | 邊界 | 剛好 500 字可以送出；501 字回 400 `ANSWER_TOO_LONG`；emoji 以 1 字計算 | FR-012 |
| T6 | 邊界 | 同組第二次送出、多分頁同時送出 → 只成功一筆，其他回 409 `ALREADY_SUBMITTED` | FR-007 |
| T7 | 邊界 | 時間到或手動結束後送出 → 409 `QUESTION_CLOSED` | US3、FR-011 |
| T8 | 邊界 | 送出不是目前開放的 questionId → 409 `QUESTION_NOT_OPEN` | FR-011 |
| T9 | 邊界 | 未分組學生送出 → 403 `NO_TEAM` | FR-012 |
| T10 | 邊界 | 沒有 token 或 token 錯誤 → REST 回 401；socket 收到 `connect_error` | R7 |
| T11 | 隔離 | 作答中，A 組的 socket 與 `GET /state` 都收不到 B 組的任何資料 | FR-015、SC-004 |
| T12 | 並行 | 10 組同時送出 → 順位 1–10 不重複，只有 1 組 WIN | SC-003 |
| T13 | 計時 | 時間到與手動結束同時觸發 → 只結束一次、只有一筆結果 | Edge Cases |
| T14 | 重啟 | 作答中重啟 → 回到 WAITING，該題沒有任何送出或結果；已結束題目的資料仍在 | FR-020a、SC-008 |
| T15 | 重連 | 作答中且本組已送出時重新連線 → 收到 ANSWERING + `myTeamSubmission` | US4、FR-004 |
| T16 | dev | 模擬操作非法轉換（作答中再開放、秒數為 0／601／"abc"、不存在的題目）→ 被拒且階段不變 | FR-023 |
| T17 | 前端 | 四種 phase 都顯示對應畫面；CLOSED 顯示本組成敗；無人送出時顯示「本題無組別送出答案」 | FR-001、FR-018 |
| T18 | 前端 | 倒數以 `serverNow` 校正（裝置時鐘快 30 秒時仍顯示正確）；歸零後顯示「時間到，等待結果」 | FR-003 |
| T19 | 前端 | 斷線時顯示提示並停用送出按鈕；送出期間按鈕停用 | FR-005、FR-014a |
| T20 | 前端 | 答案含 `<script>` 時以純文字顯示 | Edge Cases |

## 5. 手動驗證情境（端到端）

1. 開啟 http://localhost:5173/dev ，選擇第 1 組的學生登入。在另一個瀏覽器（或無痕視窗）以第 2 組的學生登入。
   - **預期**：兩個畫面都顯示「等待老師開放題目」。
2. 在 `/dev` 的模擬老師面板開放 Q1，設定 60 秒。
   - **預期**：1 秒內兩個畫面都切換為作答中，倒數相差 ≤ 1 秒。
3. 第 2 組送出答案。
   - **預期**：第 2 組顯示「本組已送出」；第 1 組的畫面**沒有任何變化**。
4. 以第 2 組再開一個分頁。
   - **預期**：新分頁直接顯示作答中與「本組已送出」。
5. 重新整理第 1 組的頁面。
   - **預期**：回到作答中，剩餘時間正確。
6. 按「手動結束」。
   - **預期**：兩組畫面都顯示結果列表；第 2 組顯示「本組搶答成功」，第 1 組顯示「本組未送出」。
7. 第 1 組此時嘗試送出（如果作答區仍可輸入）。
   - **預期**：顯示「本題搶答已結束，無法再送出答案」。
8. 開放 Q2 後，在倒數途中停止後端（Ctrl+C）再重新啟動。
   - **預期**：學生畫面先顯示連線中斷提示，重連後回到「等待老師開放題目」；`GET /api/dev/results` 只有 Q1 的結果。
9. 執行「結束活動」。
   - **預期**：所有畫面顯示「活動已結束，感謝參與」。
10. RWD 檢查：使用瀏覽器開發者工具，分別設定 375px 與 1440px 寬度。
    - **預期**：沒有水平捲軸；按鈕高度 ≥ 44px；背景為米白色，按鈕為撞色。
