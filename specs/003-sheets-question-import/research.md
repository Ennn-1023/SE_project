# Research: 學習單題目匯入（F3＋F4 互動標註）

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-23

本文件記錄 Phase 0 的技術決策。沿用 001 已定的技術棧（TypeScript、Express 5、`node:sqlite`、zod 4、React 19、Vite、Tailwind v4、Vitest），只記錄本功能新增的決策。

---

## R1. Google 授權方式：OAuth 2.0 授權碼流程＋PKCE，不加新套件

- **Decision**: 以 OAuth 2.0 Authorization Code flow（`access_type=offline`、`prompt=consent`、PKCE S256、`state`）讓老師以自己的 Google 帳號授權。scope：`openid email https://www.googleapis.com/auth/spreadsheets`。token 交換、更新、撤銷與 userinfo 皆以 Node 內建 `fetch` 呼叫 Google 端點，封裝在 `GoogleOAuthClient`，**不引入 `googleapis`／`google-auth-library`**。
- **Rationale**:
  - 已確認的決策為老師自行授權（spec Clarifications）。
  - 需要 `spreadsheets` 完整 scope：讀取儲存格、寫回答案（F10）、建立／刪除 developer metadata（R3）都需要；`spreadsheets.readonly` 不足。
  - 只用到 4 個端點（authorize、token、revoke、userinfo），自行封裝程式量小、好 mock，也符合憲章「相依套件來自可信來源並鎖版」的精神（不增加大型相依）。
  - PKCE＋`state` 防止授權碼被攔截與 CSRF；`state` 綁定目前登入的老師 session，10 分鐘失效、使用一次即刪除。
  - 老師的 email 以 userinfo 端點取得（只用於顯示「已連結 Google 帳號：…」）。
- **Alternatives considered**:
  - Service Account：已被使用者否決（需老師分享試算表給服務帳號）。
  - `googleapis` 套件：功能完整但體積大（數十 MB），而本功能只用到少數端點；mock 也較繁瑣。
  - `google-auth-library`：可處理 token 更新，但仍需自行呼叫 Sheets REST；省下的程式碼有限。

### 授權回呼網址

- 回呼網址固定為 `{CLIENT_ORIGIN}/api/google/oauth/callback`，可用 `GOOGLE_OAUTH_REDIRECT_URI` 覆寫。開發時前端（5173）以 Vite 代理 `/api` 到後端，cookie `sid` 對同一主機有效，因此回呼請求帶得到老師的 session。
- 回呼成功或失敗後，後端以 302 導回 `/teacher/questions?google=<結果>`，結果值只用固定代碼（`connected`、`denied`、`scope_missing`、`state_invalid`、`error`），不帶任何 token 或 Google 錯誤原文。

### Token 保存與更新

- refresh token 與 access token 以 **AES-256-GCM** 加密後存入 `google_connections`（每位老師一筆）；金鑰來自環境變數 `GOOGLE_TOKEN_ENCRYPTION_KEY`（base64 編碼的 32 bytes）。每筆密文帶獨立 12-byte IV 與 auth tag。
- 呼叫 Sheets 前若 access token 剩餘有效時間 < 60 秒，先以 refresh token 更新；Google 回 `invalid_grant` 時刪除連結並回 `GOOGLE_AUTH_EXPIRED`（FR-004）。
- 中斷連結時先呼叫 revoke 端點（失敗只記 log，不阻擋），再刪除資料列（FR-002）。
- 回呼時檢查 Google 回傳的 `scope` 是否含 spreadsheets；不含則不保存，導回 `scope_missing`。

---

## R2. 讀取試算表：三次呼叫取得分頁、使用範圍與格子資料

- **Decision**: `SheetsGateway.readSheet()` 依序：
  1. `GET spreadsheets/{id}?fields=properties.title,sheets.properties(sheetId,title,index,hidden)` 取得試算表名稱與分頁清單；依 `gid`（＝`sheetId`）或老師選擇決定分頁，不存在則回 `SHEET_TAB_NOT_FOUND`（附分頁清單）；未指定時預設第一個分頁。
  2. `GET spreadsheets/{id}/values/'{title}'?fields=values`，以回傳的 `values` 陣列（Google 會去除尾端空白列欄）計算實際使用範圍，據此判斷是否超過 500 列／52 欄（FR-011），以及分頁是否為空。（實作時發現回應中的 `range` 是請求的範圍而非實際範圍，故改用 `values`。）
     顯示與標註的範圍為「使用範圍＋2 列 2 欄空白邊界」（上限 500×52），並擴大到涵蓋合併範圍，讓老師能點選使用範圍外的空白作答格。
  3. `GET spreadsheets/{id}?ranges='{title}'!A1:{lastCol}{lastRow}&includeGridData=true&fields=sheets(merges,data(rowMetadata(hiddenByUser,hiddenByFilter),columnMetadata(hiddenByUser),rowData.values(formattedValue,effectiveValue.errorValue)),developerMetadata,...)` 取得格子文字、公式錯誤、合併範圍、隱藏列欄。
  4. `POST spreadsheets/{id}/developerMetadata:search`（以 `metadataKey` 篩選本系統的鍵）取得先前保存的標註（R3）。
- **Rationale**: 以 `fields` 遮罩只取需要的欄位，降低回應大小；使用範圍先行判斷可避免下載 1000×26 的空白預設格。格子文字使用 `formattedValue`（老師在畫面上看到的文字）。
- **Alternatives considered**: 只用 `values.get`——拿不到合併範圍與隱藏狀態；下載 `.xlsx`——違反「不下載離線處理」。

### 等待上限與錯誤對應（FR-009、FR-010）

所有 Google 呼叫使用 `AbortSignal.timeout(15000)`。HTTP 對應：

| Google 回應 | 系統錯誤碼 | 訊息重點 |
|---|---|---|
| 401（token 失效） | 先更新 token 重試一次；仍失敗 → `GOOGLE_AUTH_EXPIRED` | 請重新連結 Google 帳號 |
| 403（讀取時） | `SHEET_FORBIDDEN` | 沒有檢視權限 |
| 403（寫入標註時） | `SHEET_NO_EDIT_PERMISSION` | 需要編輯權限 |
| 404 | `SHEET_NOT_FOUND` | 找不到這份試算表 |
| 429 | `GOOGLE_RATE_LIMITED` | 稍後再試 |
| 400 `FAILED_PRECONDITION` | `SHEET_NOT_NATIVE`（422） | 檔案是上傳的 Excel 等非原生試算表，請「儲存為 Google 試算表」（手動驗證時發現） |
| 5xx、逾時、網路錯誤 | `GOOGLE_UNAVAILABLE` | 暫時無法連線，稍後再試 |

Google 錯誤原文只以遮罩後的摘要寫入 log，不回傳前端（憲章原則 II）。

---

## R3. 試算表標註：以 Developer Metadata 的「列錨點＋欄錨點」表示格子

- **Decision**: 使用 Sheets API 的 **developer metadata**（`visibility: PROJECT`，老師在試算表介面看不到，也不改變任何儲存格）。因 developer metadata 只能附在**整列、整欄、分頁或試算表**上、不能附在單一格，採用三種鍵：

  | metadataKey | 附在 | value（JSON，精簡鍵名） | 用途 |
  |---|---|---|---|
  | `qimport.col` | 被標註格子所在的**欄**（每欄一筆） | `{"c":"k3f9"}`——欄錨點 ID | 讓欄被插入／刪除時仍可辨識 |
  | `qimport.row` | 被標註格子所在的**列**（每列一筆） | `[{"c":"k3f9","q":"a1b2","p":0,"r":"Q"}, …]`——該列上每個被標註格子：欄錨點、題目 key、小題序、角色（`Q` 題目格／`A` 作答格／`S` 共同題幹） | 格子＝「此列」×「欄錨點所在欄」 |
  | `qimport.set` | **分頁** | `{"v":1,"qs":[{"q":"a1b2","n":"1","m":0,"k":"S","np":1,"s":0}, …]}`——題目順序、題號、是否手動修改、類型（`S` 單題／`G` 題組）、小題數、是否有共同題幹 | 還原題目清單與順序，並偵測整列被刪除的標註 |

- **Rationale**:
  - **隨格子移動**（FR-006、SC-005）：Google 會在插入／刪除列欄時自動移動附在列欄上的 metadata；刪除列或欄時 metadata 一併刪除，系統即可判定「格子已不存在」（US4 情境 3）。
  - **不改任何儲存格內容、格式或附註**（SC-006），寫回答案後標註仍在。
  - **容量**：Google 對每個位置的 metadata 有字元上限（約 30,000）。若每個標註各建一筆，常用的作答欄（例如 G 欄）可能累積上千筆而超限；改為「每欄一筆錨點、每列一筆清單」後，單列最多 52 個格子（約 2 KB）、分頁層級最多 200 題（約 6 KB），都遠低於上限。
  - 合併儲存格以左上角的列與欄記錄；合併範圍會隨插入列欄移動，左上角錨點也一起移動。
- **寫入方式**：確認匯入時以**一次** `spreadsheets.batchUpdate` 送出：先 `deleteDeveloperMetadata`（`dataFilter` 為本分頁、本系統三個 key），再 `createDeveloperMetadata`。batchUpdate 內的請求整批成功或整批失敗，符合 FR-023「附加失敗則整次匯入失敗」。
- **帶回（FR-024）**：讀取時以 `developerMetadata:search` 取回三種 metadata，依其 `location.dimensionRange.startIndex` 還原每個格子的目前位置（`AnnotationCodec.decode`），並檢查：欄錨點不存在、兩個標註落在同一格、題目格已無文字、`qimport.set` 中的題目在列 metadata 中找不到格子 → 逐一列為提醒並把該題標為未完成。
- **F10 定位（FR-007a）**：`SheetsService.locateAnswerCells()` 以同樣的 decode 取得每個作答項目（`questionKey`＋`partIndex`）**目前**所在的格子。
- **Alternatives considered**:
  - 每個標註一筆列 metadata＋一筆欄 metadata：容量會超限（見上）。
  - 具名範圍（named ranges）：可附在單格且會移動，但老師會在「資料 → 具名範圍」看到大量系統名稱，且被老師誤刪的機率高。
  - 儲存格附註：違反 SC-006（不得改變附註）。
  - 只存在系統資料庫、以位置記錄：插入列欄後位置錯誤，等同寫死。

---

## R4. 「確認匯入前學習單被修改」的偵測（FR-025）

- **Decision**: 建立草稿時保存讀取當下的格子快照（`GridSnapshot`）。確認匯入時重新讀取同一分頁（R2 的步驟 2、3），比對：(a) 使用範圍與列數、欄數；(b) 合併範圍清單；(c) 每個被標註格子的文字；(d) 本系統 metadata 是否與讀取當下相同（防止另一個分頁或裝置已先確認匯入）。任一不同即回 `SHEET_CHANGED`（409），不寫入 metadata、不保存題目集。
- **Rationale**: 插入或刪除列欄必定改變使用範圍或標註格的內容位置；只比對標註格與結構，老師在無關的格子打字不會被誤擋。
- **已知風險**：比對完成到 batchUpdate 之間（通常 < 1 秒）若有人插入列，metadata 會附在錯的列。機率極低，接受此風險並在 quickstart 註明；Sheets API 沒有可用於 batchUpdate 的樂觀鎖。
- **Alternatives considered**: Drive API 的檔案版本號——需要額外的 Drive scope，且任何無關編輯都會改版號。

---

## R5. 標註草稿放在伺服器端

- **Decision**: 讀取學習單時建立 `import_drafts` 資料列（每位老師最多一筆有效草稿），保存：來源資訊、格子快照、目前的標註文件（`AnnotationDocument`）、`revision`、30 分鐘到期時間（每次儲存標註時延長）。前端在記憶體中編輯標註，變更後 800 ms 防抖自動以 `PUT` 儲存整份標註文件；重新整理或換裝置後以 `GET /drafts/current` 續作（FR-021）。
- **Rationale**:
  - 「所見即所得」（US3）：確認匯入時伺服器只使用已保存的草稿，不再相信前端送來的題目內容。
  - 伺服器重新驗證全部規則（憲章原則 I），前端驗證只為即時回饋。
  - `revision` 防止兩個分頁同時編輯互相覆蓋（不符則回 `DRAFT_REVISION_CONFLICT`）。
  - 確認匯入以草稿狀態（`OPEN`→`CONFIRMED`）實現冪等（FR-030）：同一草稿第二次確認直接回傳已匯入的結果。
- **Alternatives considered**: 只存在瀏覽器 `sessionStorage`——關閉分頁即消失、無法跨裝置，且伺服器無法確保保存內容與預覽一致。

---

## R6. 標註規則的驗證放在 `shared`，前後端共用

- **Decision**: 在 `@buzzer/shared` 新增 `annotation.ts`：`AnnotationDocument` 型別、`validateAnnotations(doc, grid)`（回傳 `issues` 與 `warnings`）、`autoNumber(doc)`、`parseSheetLink(url)`。後端在 `PUT annotations`、`preview`、`confirm` 都呼叫；前端在每次變更後呼叫以即時顯示錯誤。
- **Rationale**: 規則只有一份實作，前後端不會不一致；後端仍是最終把關。
- **驗證規則摘要**（對應 FR-013～FR-020）：
  - 結構：單題恰 1 個小題且無共同題幹；題組 1～10 個小題、至多 1 個共同題幹；題目數 ≤ 200。
  - 格子：位置在快照範圍內；合併範圍內任一格正規化為左上角；同一格只能有一個角色（跨題檢查）；同一題的題目格 ≠ 作答格。
  - 文字：題目格與共同題幹格須為 1～2,000 字元且非公式錯誤值；作答格可空白，有內容則為 warning。
  - 題號：去頭尾空白後 1～20 字元且不重複；未手動修改者依目前順序自動重編（FR-017）。
  - 完整性（只在 preview／confirm 時視為錯誤）：每個小題都有題目格與作答格、題組至少 1 個小題。
  - warnings：作答格已有內容、位於隱藏列欄、題組只有一個小題、帶回的標註無法對應。
  - 問題清單最多回傳 50 項並附總數（FR-020）。

---

## R7. 試算表連結解析

- **Decision**: `parseSheetLink` 接受 `https://docs.google.com/spreadsheets/d/{id}/…`，也接受 `/spreadsheets/u/{n}/d/{id}`；`id` 為 `[A-Za-z0-9_-]{20,100}`。`gid` 依序從 query（`?gid=`）與 hash（`#gid=`）取得，須為非負整數。長度上限 2,000 字元；必須是 https 與 `docs.google.com` 主機（不接受其他主機以避免 SSRF 式誤用）。`docs.google.com/document/…` 等其他 Google 文件回傳相同的「請貼上 Google 試算表連結」錯誤。
- **Rationale**: 涵蓋使用者實際會複製到的網址（含 `edit?gid=…#gid=…`、`?usp=sharing`），且在連線前完成驗證（FR-008）。

---

## R8. 學習單格子的前端呈現

- **Decision**: 自製 `SheetGrid` 元件，以 CSS Grid 呈現快照的使用範圍（最多 500×52），合併格以 `grid-row`／`grid-column` span 呈現，隱藏列欄以淡色顯示。不加虛擬捲動套件。
  - 縮放：50%～200% 五段（按鈕與手勢皆可），縮放時調整格子尺寸 CSS 變數；在 ≥ 100% 時每格至少 44×44 px（FR-034）。
  - 格子文字截斷顯示，點選後在「選取格」面板顯示完整文字與目前角色。
  - 已標註格以撞色底色與角標（`題1`、`答1-2`、`幹3`）標示。
  - 版面：桌機與平板左右排列（格子｜題目清單）；手機上下排列，題目清單收在可展開的底部面板；格子區塊自身捲動，頁面無水平捲動。
  - 標註操作採「目前步驟」導引：新增題目後提示「請點選題目格」→「請點選作答格」，完成後自動進入下一步；題組則提示「點選小題（1）的題目格」…。
- **Rationale**: 範例學習單的使用範圍約 15 列×8 欄，一般學習單遠小於上限；500×52 的上限下 DOM 數量仍可接受。自製元件可完整控制合併格、觸控與縮放，且不增加相依套件。
- **Alternatives considered**: 嵌入 Google 試算表 iframe——無法攔截點選事件；表格套件（AG Grid 等）——體積大、合併格與觸控客製困難。

---

## R9. 資料表與既有 `questions` 表的關係

- **Decision**: 新增 migration version 3：`google_connections`、`oauth_states`、`import_drafts`、`question_sets`、`question_set_questions`、`answer_slots`、`question_events`。不修改 002 的 `questions`（屬於搶答活動）；F5 建立活動時再從目前題目集複製題目到活動。
- **Rationale**: 避免本功能改動已上線的搶答流程；題目集（匯入來源）與活動題目（搶答進行中）生命週期不同。
- 細節見 [data-model.md](data-model.md)。

---

## R10. 環境變數

| 變數 | 必填 | 規則 | 說明 |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | 選填（成組） | 非空，≤ 200 字元，以 `.apps.googleusercontent.com` 結尾 | Google OAuth 用戶端 ID |
| `GOOGLE_CLIENT_SECRET` | 選填（成組） | 非空，≤ 200 字元 | Google OAuth 用戶端密鑰 |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | 選填（成組） | base64，解碼後恰好 32 bytes | 加密保存的 token |
| `GOOGLE_OAUTH_REDIRECT_URI` | 選填 | `http(s)://` 開頭的完整網址；預設 `{CLIENT_ORIGIN}/api/google/oauth/callback` | 需與 Google Cloud Console 設定一致 |

- 三個「成組」變數**全部留空**＝Google 串接未設定：系統正常啟動，題目管理顯示「系統尚未設定 Google 試算表串接」（spec Edge Cases）。
- **只填部分**或格式錯誤＝設定錯誤：依既有 `ConfigError` 列出變數名稱與規則並停止啟動（憲章原則 III），不輸出任何值。
- `Logger` 的遮罩規則已涵蓋 `secret`、`token`；另將 `code`（OAuth 授權碼）、`verifier`、`key` 加入遮罩鍵名。
- roadmap 列的 `APP_BASE_URL` 以既有的 `CLIENT_ORIGIN` 取代，不另設變數。

---

## R11. 測試策略

- **Google 替身**：`SheetsGateway` 與 `GoogleOAuthClient` 皆為介面。整合測試注入 `FakeGoogle`（記憶體模擬）：保存多份虛構試算表（含兩份範例的版面），支援讀取、developer metadata 建立／刪除／搜尋，並提供 `insertRows`／`deleteColumns` 等操作，**依 Google 的規則移動或刪除 metadata**，以驗證 SC-005。
- **HTTP 轉接器測試**：`GoogleSheetsHttpGateway`、`GoogleOAuthHttpClient` 以假的 `fetch` 回放錄好的回應範例（JSON fixture，內容為虛構資料），驗證請求網址、`fields`、標頭與錯誤對應（R2 表格），並驗證 15 秒逾時（假計時器）。
- **shared 單元測試**：`parseSheetLink`、`validateAnnotations`、`autoNumber` 的正常與邊界案例（每條規則至少一個拒絕案例）。
- **後端單元測試**：`AnnotationCodec` encode／decode 往返、插入列後 decode、欄錨點遺失；`TokenCipher` 加解密與竄改偵測；Config 的成組規則。
- **後端整合測試（supertest）**：OAuth start／callback（state 錯誤、拒絕授權、scope 不足）、讀取、標註儲存（revision 衝突）、preview、confirm（冪等、SHEET_CHANGED、無編輯權限、附加失敗回滾）、重新匯入帶回、清除題目集、中斷連結、學生 403、log 與回應不含 token。
- **前端測試**：`SheetGrid` 合併格與點選、標註步驟導引、題組與共同題幹、題號自動重編、錯誤清單呈現、375px 版面（無水平捲動的 class 檢查）。
- **手動驗證**：以真實 Google 帳號與兩份範例試算表的副本執行 [quickstart.md](quickstart.md) 的情境（不在自動化測試中連線 Google）。
- 單一指令：`npm test`（憲章原則 V）。

---

## R12. 設計圖與一致性驗證

- **Decision**: 新增 `diagrams/003-component.puml`、`003-class.puml`、`003-sequence-connect.puml`、`003-sequence-import.puml`、`003-sequence-reimport.puml` 並產生 PNG。`diagram-consistency.test.ts` 擴充為同時讀取 001 與 003 的 plan 與圖：組件、類別與檔案的對照取兩份 plan 的聯集，「無多餘檔案」檢查也以聯集判斷。新增 `integrations/` 與 `domain/` 下本功能檔案列入檢查目錄。
- **Rationale**: 憲章原則 VI；不擴充的話，新增的 routes／services／db 檔案會讓既有測試失敗。
- 時序圖的呼叫順序在實作後依 quickstart §7 手動比對。
