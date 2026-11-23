# Quickstart: 學習單題目匯入（F3＋F4 互動標註）

驗證本功能可端到端運作的步驟。API 細節見 [contracts/openapi.yaml](contracts/openapi.yaml)，資料結構見 [data-model.md](data-model.md)。

## 1. 前置條件

- 已完成 001 的環境（Node.js ≥ 24、`npm install`、`.env` 中 001 的必填變數、`npm run db:seed -w backend`）。
- **自動化測試不需要 Google 帳號或任何真實憑證**（使用 FakeGoogle，research R11）。

## 2. Google 串接設定

### 2.1 系統管理者：一次性設定（老師不需要做）

任何網站要代替使用者讀寫 Google 試算表，Google 都要求先登記取得 OAuth 用戶端身分；老師按「同意」時看到的「XX 想要存取你的 Google 試算表」就是依此顯示。整個系統只需設定一次（約 10 分鐘、免費）：

1. 在 Google Cloud Console 建立專案，啟用 **Google Sheets API**。
2. 設定 OAuth 同意畫面：課堂專題用「測試」模式即可，並把會使用的老師 Google 帳號加入「測試使用者」（最多 100 個）。
3. 建立「網頁應用程式」類型的 OAuth 用戶端，授權重新導向 URI 設為 `http://localhost:5173/api/google/oauth/callback`（正式環境改為實際網址，並設定 `GOOGLE_OAUTH_REDIRECT_URI`）。
4. 把下列值寫入 `.env`（不得提交）：

```text
GOOGLE_CLIENT_ID=<OAuth 用戶端 ID>
GOOGLE_CLIENT_SECRET=<OAuth 用戶端密鑰>
GOOGLE_TOKEN_ENCRYPTION_KEY=<32 bytes 的 base64>
# 選填：GOOGLE_OAUTH_REDIRECT_URI（預設 {CLIENT_ORIGIN}/api/google/oauth/callback）
```

產生加密金鑰：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

三個變數全部留空時系統仍可啟動，題目管理顯示「系統尚未設定 Google 試算表串接」；只填部分則啟動失敗並列出缺少的變數名稱（research R10）。

**測試模式的限制**：登入時會出現「Google 尚未驗證這個應用程式」的警告（按「繼續」即可）；授權每 7 天失效一次，屆時老師會看到「Google 帳號授權已失效，請重新連結 Google 帳號」，重新連結即可。若要拿掉這些限制，需送 Google 審核（課堂專題通常不需要）。

### 2.2 老師：日常操作

1. 在老師管理頁按「題目管理」，再按「連結 Google 帳號」，以自己的 Google 帳號登入並同意存取試算表。
2. 貼上自己雲端硬碟中學習單的連結（需有**編輯**權限，系統才能保存標註與日後寫回答案），按「讀取學習單」。
3. 依步驟點選每題的題目格與作答格 → 預覽匯入 → 確認匯入。

手動驗證（§5）另需把兩份範例學習單各「建立副本」到老師的 Google 雲端硬碟。

## 3. 啟動

```bash
npm run db:migrate -w backend
```

```bash
npm run dev
```

以老師帳號登入 `http://localhost:5173`，在老師管理頁按「題目管理」（`/teacher/questions`）。

## 4. 自動化測試（憲章原則 V）

```bash
npm test
```

只跑本功能相關的測試：

```bash
npm test -w shared -- annotation
```

```bash
npm test -w backend -- google question annotationCodec tokenCipher diagram-consistency
```

```bash
npm test -w frontend -- QuestionManagePage SheetGrid AnnotationPanel
```

預期：全部通過；回報時附上通過／失敗數量。

## 5. 手動驗證情境（真實 Google）

| # | 步驟 | 預期結果 |
|---|---|---|
| 1 | 未設定 GOOGLE_* 啟動，進入題目管理 | 顯示「系統尚未設定 Google 試算表串接」，連結按鈕停用；帳號、組別功能正常 |
| 2 | 設定後按「連結 Google 帳號」，在 Google 頁面按取消 | 回到本頁顯示「未完成 Google 帳號連結，請再試一次」 |
| 3 | 再次連結並同意 | 顯示「已連結 Google 帳號：<email>」 |
| 4 | 貼上 `https://docs.google.com/document/d/xxx` | 不連線，顯示「請貼上 Google 試算表連結…」 |
| 5 | 貼上單題範例副本連結 | 顯示「學習單」分頁格子，C5～F5 為一個合併格 |
| 6 | 依序標註 6 題（題目格 C 欄、作答格 G 欄） | 清單 6 題、題號 1–6、作答格 `學習單!G5`、`G7`…`G15` |
| 7 | 第 4 題只點題目格就按「預覽匯入」 | 列出「第 4 題缺少作答格」，不進入預覽 |
| 8 | 補完後預覽→確認匯入 | 「已匯入 6 題」；打開 Google 試算表，內容、格式、附註完全沒變 |
| 9 | 讀取題組範例副本：第 1、2 題設為題組各 2 小題（題目 C 欄、作答 H 欄），第 3、4 題單題（作答 G 欄） | 4 題、6 個作答格；預覽提示將取代目前 6 題的題目集 |
| 10 | 確認匯入後，在試算表第 3 列上方插入 2 列，再按「重新匯入」 | 「已帶回上次的標註（4 題）」，所有作答格順延 2 列（例如 H5→H7） |
| 11 | 刪除含第 3 題作答格的欄（G 欄）後重新匯入 | 第 3、4 題提醒「作答格已不存在，請重新指定」並標為未完成 |
| 12 | 讀取後在另一個分頁修改某個標註格的文字，再按確認匯入 | 「學習單在標註期間被修改，請重新讀取並確認標註」，題目集不變 |
| 13 | 以 375px 寬度（瀏覽器裝置模擬）完成情境 9 的標註與匯入 | 頁面無水平捲動，格子可縮放，觸控點選正確 |
| 14 | 以學生帳號開 `/teacher/questions` 與呼叫 `POST /api/question-import/drafts` | 畫面顯示「此功能僅限老師使用」；API 回 403「權限不足」 |
| 15 | 按「中斷 Google 連結」 | 回到未連結；題目集仍在；Google 帳號「第三方存取」中已無此應用程式 |
| 16 | 檢查後端 log 與瀏覽器網路回應 | 沒有任何 access／refresh token、授權碼或 client secret |
| 17 | 用另一個帳號把試算表分享給老師（只給「檢視者」），讀取、標註後按確認匯入 | 讀取與標註正常；確認時顯示「…沒有這份試算表的編輯權限，無法保存標註」，題目集不變、標註草稿保留 |

## 6. 已知限制

- 確認匯入時「重新比對」與「寫入標註」之間（通常 < 1 秒）若有人插入列，標註可能附到錯的列（research R4）；重新匯入時即可發現並修正。
- 標註需要試算表的編輯權限；只有檢視權限時可讀取與標註，但無法確認匯入。

## 7. 設計圖一致性驗證（憲章原則 VI）

1. `diagram-consistency.test.ts` 自動比對 `diagrams/003-component.puml`、`003-class.puml` 與 [plan.md](plan.md) 對照表。
2. 依 `003-sequence-connect`、`003-sequence-import`、`003-sequence-reimport` 逐步比對實際程式的呼叫順序、錯誤碼與分支，結果記錄於完成回報。
