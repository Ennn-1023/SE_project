# 設計圖一致性驗證（T088、T089，憲章原則 VI）

**日期**：2026-11-24 | **Plan**：[plan.md](plan.md)

## 1. 組件圖與類別圖（自動化，T088）

`backend/tests/architecture/diagram-consistency.test.ts` 已擴充為同時讀取 001 與 003 的 plan 與圖：

- 003 組件圖 30 個組件皆在 plan.md 對照表中有檔案並匯出同名符號（外部服務 cloud 不列入）。
- 003 類別圖的類別、介面、列舉皆在對照檔案中匯出；服務、repository、外部整合（GoogleOAuthClient、SheetsGateway）的公開方法與類別圖完全一致；實體的主要屬性皆存在。
- `routes／services／db／middleware／integrations/google` 下沒有 001＋003 對照表與允許清單以外的檔案。
- 003 類別圖位於 package 內有縮排，解析器已改為允許行首空白（001 結果不變）。

結果：`npm test -w backend -- diagram-consistency` → 165 passed。

## 2. 時序圖逐步比對（手動，T089）

| 時序圖 | 比對結果 | 處理 |
|---|---|---|
| 003-sequence-connect | start：`deleteExpired → encrypt(verifier) → create(state) → buildAuthUrl` 與程式相同；callback：`take(state) → 檢查過期／session → access_denied → exchangeCode → scope 檢查（不足時 revoke）→ fetchEmail → encrypt → upsert → record` 與 `GoogleAuthService.handleCallback` 相同；disconnect：`findByUser → decrypt → revoke（失敗只記 log）→ delete → record` 相同 | 圖上補註：回呼不掛 RequireAuth，以 cookie 的 sid 經 SessionService.validate 取得 session 且須為老師 |
| 003-sequence-import | createDraft：`parseSheetLink → readSheet（getAccessToken → getSpreadsheet → getUsedRange → getGrid → searchMetadata）→ decode → validate → fingerprint → create` 相同；saveAnnotations：`findById → 過期／revision 檢查 → autoNumber＋validate → updateAnnotations` 相同；preview、confirm 的分支（CONFIRMED 冪等、ANNOTATION_INVALID、SHEET_CHANGED、SHEET_NO_EDIT_PERMISSION、DB 交易）與程式相同 | 圖上補註：Google 回 401 時強制更新 token 重試一次；getGrid 的範圍含 2 列 2 欄空白邊界；`encode` 參數加上 `sheetId` |
| 003-sequence-reimport | reimport：`findCurrent → createDraftFromSource → readSheet → decode → create → record(REIMPORTED)` 相同；locateAnswerCells：`readSheet → decode` 相同 | 圖上補：clear 先 `findCurrent`（沒有題目集時不記錄事件）；writeCells 先 `getSpreadsheet` 由 sheetId 取得分頁名稱 |

以上偏離皆為補充細節，未改變架構；已先修改 `.puml`，執行 `java -jar plantuml.jar -charset UTF-8 "./diagrams/003-*.puml"` 重新產生 PNG，再同步類別圖簽章（`encode(doc, snapshot, sheetId)`、`getAccessToken(userId, forceRefresh?)`、`updateValues(token, spreadsheetId, sheetTitle, updates)`）。

## 3. 實作期間的設計補充（已同步至文件）

| 項目 | 原設計 | 實作 | 更新的文件 |
|---|---|---|---|
| 使用範圍的取得 | values.get 回應的 `range` | Google 的 `range` 回傳的是請求範圍而非實際範圍，改以 `values` 陣列計算列數與欄數 | research R2 |
| 可點選範圍 | 只顯示使用範圍 | 使用範圍再加 2 列 2 欄空白邊界，並擴大到涵蓋合併範圍，讓老師能點選範圍外的空白作答格 | research R2、R8 |
| `qimport.set` 內容 | `q、n、m、k` | 另加 `np`（小題數）、`s`（是否有共同題幹），用來偵測整列被刪除的小題與題幹 | data-model §3 |
| 學生呼叫時的訊息 | 「權限不足」 | 沿用 001 RequireRole 的 403 `FORBIDDEN`「此功能僅限老師使用」，不另改 001 行為 | plan「錯誤情境與訊息」 |
| 題目集用語 | — | 整份匯入結果稱「題目集」、含小題的題目稱「題組」（/speckit-analyze 後統一） | spec Clarifications |
