# Quickstart：老師端側邊選單導覽與題目標註逐題切換

本文件是驗證指南：說明怎麼跑自動化測試，以及怎麼手動走過 spec 的驗收情境。畫面合約見 [contracts/ui-routes.md](contracts/ui-routes.md)，狀態轉換見 [data-model.md](data-model.md)。

## 1. 前置條件與指令

- Node.js 24 以上，已在專案根目錄執行 `npm install`。
- `.env` 依 `.env.template` 填寫。本功能**不需要新的環境變數**。
- 已有 001 的老師帳號（`npm run seed -w backend`）。
- 手動驗證標註時，需要 003 的 Google 設定，以及一份可匯入的學習單副本（內容使用虛構資料）。

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
npm run test -w frontend -- SideMenu TeacherLayout StudentManagePage routeGuards LoginPage
```

```bash
npm run test -w frontend -- AnnotationPanel QuestionPager QuestionOverview SheetGrid QuestionManagePage
```

```bash
npm run test -w frontend -- narrowScreen ActivityStartPanel
```

```bash
npm run test -w backend -- tests/architecture/diagram-consistency
```

| spec 項目 | 正常案例 | 邊界案例 | 測試檔 |
|-----------|----------|----------|--------|
| US1／FR-001～007 | 登入後落在 `/teacher` 的「搶答活動」；打開選單後可依序切換三個畫面 | Esc、點遮罩、再按按鈕都會關閉；`aria-current`；焦點回到按鈕；學生頁面沒有選單；`/teacher/activity` 被導回 | `routeGuards`、`LoginPage`、`SideMenu`、`TeacherLayout` |
| US2／FR-008～011 | 學生管理畫面兩個區塊都在，而且互相連動 | 學生開啟 `/teacher/students` 被拒；畫面上沒有舊的入口按鈕 | `StudentManagePage`、`routeGuards` |
| US3／FR-014～021、023、024 | 上一題、下一題、位置提示；新增題目後切到新題 | 只有一題；在首題或末題時按鈕停用；刪除的三種分支；上移下移後仍是同一題；步驟進行中切題會取消步驟；前往第 N 題；載入時回到第 1 題；角標 `data-current`；畫面上只有 1 張編輯卡片 | `AnnotationPanel`、`QuestionPager`、`SheetGrid`、`QuestionManagePage` |
| US4／FR-022 | 總覽只在有錯的題目標「⚠」，點了會跳題 | 修正後標示立即消失；只有提醒（warnings）的題目不標示 | `QuestionOverview`、`AnnotationPanel` |
| US5／FR-012～013a | 所有老師畫面都沒有開發工具入口 | `/dev` 顯示 404；後端 `/api/dev` 的測試照常通過 | `routeGuards`、`StudentManagePage`、後端 `devTeacher.test.ts` |
| SC-005 | — | 360px 寬時，選單和總覽都不溢出 | `narrowScreen` |
| 憲章 VI | 006 的組件圖與類別圖都有對應的程式碼 | 001／003／004 組件圖已改成 StudentManagePage | `diagram-consistency` |

## 3. 手動驗證情境

先啟動開發環境：

```bash
npm run dev
```

1. **登入落地（SC-001）**
   - 以老師帳號登入，應直接看到「搶答活動」，不需要再點任何東西。
   - 在網址列輸入 `/teacher/activity`，應被導回 `/teacher`。
2. **側邊選單**
   - 按左上角的三條線，左側應滑出三個項目，「搶答活動」為目前項目。
   - 點「學生管理」，應切換畫面並收起選單。
   - 再打開選單後按 Esc，選單應收起，焦點回到按鈕。
   - 打開選單後點右側的遮罩，選單應收起。
3. **學生管理**
   - 建立一位虛構學生，組別管理的下拉選單應立即出現這位學生。
   - 改變組別成員後，學生清單的組別應同步更新。
4. **開發工具已移除（SC-006）**
   - 在開發環境中，所有老師畫面與選單都找不到「模擬老師搶答操作」。
   - 開 `/dev` 應顯示「找不到這個頁面」。
5. **逐題標註（SC-002、SC-003）**
   - 匯入學習單後，連續新增 10 題以上。每新增一題，畫面就切到新的那一題，頁面長度維持不變。
   - 用「上一題」、「下一題」走過每一題，位置提示應正確。
   - 刪除中間、最後、以及唯一的一題，確認之後顯示的題目符合 [data-model §3](data-model.md)。
   - 在指定作答格的步驟中按「下一題」，步驟應被取消，格子不會被指定到錯誤的題目。
   - 點選格線上屬於其他題的角標格，應出現「前往第 N 題」，按下後切換過去。
   - 故意讓第 2 題和第 5 題缺少作答格，總覽應只有這兩題出現「⚠」，點題號可直接跳過去。修正後「⚠」應消失。
6. **手機寬度（SC-005）**：以瀏覽器裝置模擬 360×800，重複第 2 步和第 5 步，不應出現水平捲軸。
7. **學生端不受影響**：以學生帳號登入，頁首沒有三條線按鈕，搶答流程與之前相同。

## 4. 完成回報格式

回報時附上以下內容：

- `npm test`、`npm run typecheck`、`npm run lint` 的實際輸出摘要，包括 shared、backend、frontend 各自的通過數。
- 手動驗證做到第幾項。
- 沒驗證到的部分，例如真實手機只用模擬器驗證。
