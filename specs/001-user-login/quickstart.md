# Quickstart & Validation: 登入與身分驗證／權限控管（F1）

**Feature**: [spec.md](spec.md) | **API**: [contracts/api.md](contracts/api.md) | **Data model**: [data-model.md](data-model.md)

本文件說明如何在本機跑起 F1 並驗證它符合規格。實作完成前，以下指令尚無法執行。

## 前置需求

- Node.js 26 LTS（`node -v` 顯示 `v26.x`）、npm 10 以上
- 不需要另外安裝資料庫（使用 SQLite 檔案）

## 設定

1. 安裝相依套件（根目錄，npm workspaces 會一併安裝 `backend`、`frontend`、`shared`）：

   ```bash
   npm install
   ```

2. 建立環境變數檔：

   ```bash
   cp .env.template .env
   ```

   在 `.env` 填入自己的值（**不要提交**）。所需變數見 [research.md R8](research.md#r8-必要環境變數與啟動檢查fr-022憲章原則-iii)：`DATABASE_URL`（例如 `file:./dev.db`）、`SESSION_SECRET`（至少 32 字元）、`STUDENT_DEFAULT_PASSWORD`、`TEACHER_INITIAL_PASSWORD`（皆 8–64 字元），選填 `TEACHER_USERNAME`（預設 `teacher`）。

3. 建立資料表並初始化老師帳號：

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run seed
   ```

## 執行

```bash
npm run dev
```

- 前端：<http://localhost:5173>（`/api` 經 Vite proxy 轉到後端 <http://localhost:3000>）

## 自動化測試（憲章原則 IV、V）

```bash
npm test
```

完成時須回報此指令的實際輸出（通過／失敗數量）。可分開執行：

```bash
npm test -w backend
```

```bash
npm test -w frontend
```

測試使用假的密碼與暫存 SQLite，不需要 `.env`。

## 手動驗證情境

以 `.env` 中的值操作；以下用「預設密碼」「老師密碼」代稱，請勿把實際值寫進任何檔案。

| # | 步驟 | 預期結果 | 對應 |
|---|------|----------|------|
| 1 | 刪除 `.env` 中的 `SESSION_SECRET` 後執行 `npm run dev` | 後端停止並顯示缺少 `SESSION_SECRET`（不顯示任何值） | FR-022 |
| 2 | 以 `teacher`＋老師密碼登入 | 導向 `/teacher` | US2 |
| 3 | 再次執行 `npm run seed` | 顯示老師帳號已存在、未變更 | FR-001 |
| 4 | 在 `/teacher/students` 新增學號 `411000001`、姓名「測試學生」、組別「A」 | 清單出現該學生，「仍使用預設密碼」 | US3-1、US3-5 |
| 5 | 再新增一次 `411000001` | 「學號 411000001 已存在」，原帳號不變 | US3-2 |
| 6 | 新增學號 `41100001`（8 碼）且姓名留空 | 同時指出學號與姓名兩個欄位的錯誤 | US3-3、US3-4 |
| 7 | 另一個瀏覽器（或無痕視窗）以 `411000001`＋預設密碼登入 | 直接進入 `/student`，看到「建議修改密碼」提示，不被強制修改 | US1-1、US6-4 |
| 8 | 以 `411000001`＋錯誤密碼登入；再以 `499999999` 登入 | 兩者都顯示「學號或密碼錯誤」 | US1-2、US1-3 |
| 9 | 連續輸錯密碼 10 次後輸入正確密碼 | 立即登入成功 | FR-010 |
| 10 | 學生登入狀態下，在網址列輸入 `/teacher/students` | 被導回 `/student`；直接呼叫 `GET /api/students` 回 403「權限不足」 | US4 |
| 11 | 學生在 `/account/password` 將密碼改為與預設密碼相同 | 被拒絕並說明不得與預設密碼相同 | US6-2 |
| 12 | 學生改成新密碼 | 成功；舊密碼無法登入、新密碼可登入；其他裝置上的登入失效 | US6-1、FR-020 |
| 13 | 老師對該學生「重設密碼」並確認 | 學生其他裝置立即被登出；預設密碼可再次登入 | US6-3 |
| 14 | 老師刪除該學生，先按「取消」，再刪除並確認 | 取消時不變；確認後學生下一個操作被導回登入頁，登入顯示「學號或密碼錯誤」；之後可重新新增同學號 | US3-7、US3-8 |
| 15 | 按登出後按瀏覽器「上一頁」 | 無法再操作受保護頁面 | US5-1 |
| 16 | 瀏覽器開發者工具切到 375px 與 1440px 寬度檢視登入頁與學生清單頁 | 無水平捲動，按鈕高度 ≥ 44px，米白底＋撞色按鈕 | SC-008 |

閒置 2 小時／登入滿 12 小時的逾時（US5-2）以自動化測試的假時鐘驗證，不需手動等待。

## 已知注意事項

- 部署後若修改 `STUDENT_DEFAULT_PASSWORD`，**已建立**的學生仍使用舊預設密碼，直到老師對其執行重設。
- 不限制登入失敗次數（規格決定）；可從資料庫 `SecurityEvent` 表查核登入失敗紀錄。
