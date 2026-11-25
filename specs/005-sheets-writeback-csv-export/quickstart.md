# Quickstart：答案寫回 Google 試算表＋活動結果匯出 CSV（F10＋F11）

本文件是驗證指南：說明如何執行自動化測試，以及手動走過 spec 的驗收情境。API 見 [contracts/openapi.yaml](contracts/openapi.yaml)，CSV 格式見 [contracts/csv-format.md](contracts/csv-format.md)，畫面見 [contracts/ui-routes.md](contracts/ui-routes.md)，資料表見 [data-model.md](data-model.md)。

## 1. 前置條件

- Node.js ≥ 24，已在根目錄執行 `npm install`。
- `.env` 依 `.env.template` 填寫。本功能**不需要新的環境變數**；寫回需要 003 的 `GOOGLE_*` 設定（只驗證 CSV 時可省略）。
- 已有 001 老師帳號（`npm run seed -w backend`）。
- 手動驗證寫回：一份老師 Google 帳號有**編輯權限**的學習單副本（以 003 的單題範例與題組範例各複製一份，使用虛構內容）。

## 2. 自動化測試（憲章原則 IV、V）

全部：

```bash
npm test
```

分區執行：

```bash
npm run test -w shared -- resultExport
```

```bash
npm run test -w backend -- tests/unit/csvEncoder tests/unit/activityResultReader tests/unit/writebackService tests/unit/migrations
```

```bash
npm run test -w backend -- tests/integration/writeback tests/integration/export tests/integration/resultExport tests/integration/activity.start
```

```bash
npm run test -w frontend -- WritebackPreviewDialog ExportCsvButton ActivityControlPage narrowScreen
```

```bash
npm run test -w backend -- tests/architecture/diagram-consistency
```

型別與 lint：

```bash
npm run typecheck
```

```bash
npm run lint
```

### 測試群組對照 spec

| 測試 | 涵蓋 |
|------|------|
| `csvEncoder.test.ts` | FR-020、FR-021：BOM、CRLF、`,`／`"`／換行包覆；`=`、`@` 加 `'`；`+`、`-`、Tab、CR 不加；中文 |
| `activityResultReader.test.ts` | FR-001、FR-002、FR-019：最近一場、作廢輪次排除、作答中與未開放不帶送出 |
| `writebackService.test.ts` | FR-006～FR-015：EMPTY／OVERWRITE／SAME_CONTENT／ANNOTATION_MISSING／ANNOTATION_DUPLICATED、兩種 mode、後備位置勾選、STALE（內容變動、結果變動）、冪等、Google 錯誤不寫入 |
| `migrations.test.ts` | v5 欄位、CHECK、v4 → v5 既有資料保留 |
| `activity.start.test.ts`（擴充） | FR-005：開始活動記錄來源試算表與作答格後備位置；重新匯入不影響本場寫回目標 |
| `writeback.preview.test.ts` | US1-1、US1-3～5、US4-1～4、US4-6、US5-1、US5-3、US5-4 |
| `writeback.confirm.test.ts` | US1-2、US2-1～6、US4-5、US4-7～9、US5-2；SC-003、SC-004、SC-005 |
| `export.csv.test.ts` | US3-1～7a、US4-1；SC-007；不含學生個資 |
| `resultExport.auth.test.ts` | US1-7、US3-8、FR-004；SC-008 |
| `WritebackPreviewDialog.test.tsx` | 摘要、覆蓋選項必選、後備位置勾選、STALE 重新預覽、純文字呈現（FR-027） |
| `ExportCsvButton.test.tsx` | 下載觸發、錯誤訊息顯示 |
| `narrowScreen.test.tsx` | SC-010：375px 無水平捲動 |
| `diagram-consistency.test.ts` | 原則 VI：005 組件、類別、時序與程式一致 |

## 3. 手動驗證情境

啟動：

```bash
npm run dev
```

### 3.1 寫回（US1、US2）

1. 老師登入 → 題目管理 → 連結 Google → 匯入「單題範例副本」（6 題）。
2. 組別管理建立 3 組學生（虛構資料）→ 搶答活動 → 開始活動。
3. 以 3 個學生分頁作答：第 1～4 題各由不同組最快送出；第 5 題開放後無人送出（時間到）；第 6 題不開放。
4. 在試算表第 1 題作答格手動輸入「老師筆記」。
5. 按「寫回 Google 試算表」：**預期**摘要「3 格將寫入空白格、1 格將覆蓋既有內容」；第 1 題卡片顯示目前內容「老師筆記」；不寫入清單有第 5、6 題。
6. 選「略過已有內容的格子」→ 確認：**預期**「已寫回 3 格，略過 1 格（已有內容）」；試算表第 1 題仍為「老師筆記」，第 2～4 題為成功組別答案，其他儲存格未變。
7. 再預覽一次 → 選「全部覆蓋」→ 確認：第 1 題變成成功組別答案；第 2～4 題顯示「已是相同內容」，不重複寫入。

### 3.2 插入列後寫回（US1-4）

1. 在試算表第 1 題上方插入 2 列。
2. 重新預覽：**預期**作答格位置下移 2 列，寫入新位置。

### 3.3 預覽後變動（US2-5）

1. 開啟預覽後，在試算表修改第 3 題作答格。
2. 按「確認寫回」：**預期**「學習單在預覽後有變動（第 3 題作答格），請重新預覽」，試算表未被修改。

### 3.4 Google 錯誤（US4-4、US4-5）

1. 將試算表分享權限改為「檢視者」→ 確認寫回：**預期**「沒有這份試算表的編輯權限」，未修改。
2. 在題目管理中斷 Google 連結 → 開啟預覽：**預期**「請先連結 Google 帳號」與連結入口；「匯出結果 CSV」仍可下載。

### 3.5 找不到標註（US5）

1. 結束活動後，在題目管理重新讀取同一份學習單，於標註畫面移除第 3 題的作答格標註並確認匯入（題目集被取代不影響本場活動的寫回目標，FR-005）。
2. 預覽：**預期**第 3 題「找不到作答格標註（匯入時位置：…）」，預設不寫入；勾選後確認寫入匯入時位置。

### 3.6 CSV（US3）

1. 以學生答案「光合作用,需要光」、多行答案、「=1+1」、「-5 度」完成一場含題組的活動。
2. 按「匯出結果 CSV」，以 Excel 與 Google 試算表開啟：**預期**檔名 `搶答結果_YYYYMMDD-HHmm.csv`；中文正常；逗號與換行在同一格；「=1+1」顯示為文字 `'=1+1`（或 `=1+1` 文字）；「-5 度」原樣；未送出組別順位為「未送出」；沒有任何學生姓名或學號。

### 3.7 權限（US1-7、US3-8）

以學生帳號登入後直接呼叫：

```bash
curl -i -X POST http://localhost:3000/api/teacher/activity/writeback/preview -b "sid=<學生 sid>"
```

**預期**：403 `FORBIDDEN`「權限不足」，回應不含結果資料。

### 3.8 手機版面（SC-010）

瀏覽器開發者工具切到 375px 寬：活動頁、寫回預覽對話框、結果面板皆無水平捲動，按鈕可點按。

## 4. 回報格式（原則 V）

完成時回報實際執行的指令與結果，例如：

```text
npm test
shared   Tests  N passed (N)
backend  Tests  N passed (N)
frontend Tests  N passed (N)
```

若有測試跳過，說明原因。
