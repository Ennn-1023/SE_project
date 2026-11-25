# 課程搶答系統

課堂搶答系統：老師與學生登入，學生以組別為單位搶答。目前完成：

- **001-foundation-auth-groups（F0／F1／F2）**：米白／撞色 RWD 風格、老師建立的學號帳號與統一預設密碼登入、
  伺服器端 session 與角色權限、以編號識別的組別管理（學生僅能在未分配時自選，老師可隨時調整）。
- **002-student-buzzer（F7、F9 與 F6 學生端）**：學生以 001 帳號登入、已分組後進入搶答頁，
  依活動階段切換畫面；以組別送出、伺服器決定順位；斷線重連與伺服器重啟後回到正確畫面。
- **003-sheets-question-import（F3／F4）**：老師以自己的 Google 帳號授權後讀取雲端學習單，
  在格子上逐題點選題目格與作答格（單題與題組可混合、題數不限，不寫死儲存格），預覽後匯入為目前題目集；
  標註以看不到的 developer metadata 附在試算表上，插入或刪除列欄後仍對應原本的格子，重新匯入時自動帶回。
- **004-activity-control-monitor（F5／F8）**：老師以匯入的題目集與現有組別開始活動，逐題設定秒數（5～600，預設 60）開放搶答；
  伺服器計時到點自動結束，也可手動提前結束、在結果畫面直接開放下一題、經確認重新開放已結束題目（新一輪取代舊結果）。
  作答中老師看板即時顯示各組送出狀態、順位、送出時間、送出者與答案（題組依小題），結束後顯示結果並可回顧本場題目；
  活動進行中鎖定題目集、作答中鎖定組別；學生端支援題組多作答框。
- **005-sheets-writeback-csv-export（F10／F11）**：對最近一場活動，可把每題搶答成功組別的答案**寫回 Google 試算表**
  （先預覽寫入位置、選擇全部覆蓋或略過已有內容，再以單一批次純文字寫入；被保護範圍擋下時列出受影響的題目），
  也可**匯出結果 CSV**（每題每組每小題一列，UTF-8 BOM，防公式注入，不含學生個資）。
- **006-teacher-nav-annotation-paging**：老師登入後直接進入「搶答活動」，左上角三條線按鈕打開側邊選單，
  切換「搶答活動」、「題目管理」、「學生管理」；題目標註改為一次只顯示一題，以上一題／下一題切換，
  並有題號總覽標出有錯的題目。前端的開發工具頁（`/dev`）已移除。
- **007-answer-countdown-color**：學生作答頁的剩餘時間依老師設定的秒數倒數（以伺服器結束時間為準），
  平常為深藍色，剩 10 秒內改為與老師看板相同的橘色；題目較長需要捲動時，題號與倒數那一列固定在畫面頂端。

文件：

- 規劃：[roadmap.md](roadmap.md)
- 規格、計畫、任務（每個功能一個資料夾）：
  [001](specs/001-foundation-auth-groups/)、[002](specs/002-student-buzzer/)、[003](specs/003-sheets-question-import/)、
  [004](specs/004-activity-control-monitor/)、[005](specs/005-sheets-writeback-csv-export/)、
  [006](specs/006-teacher-nav-annotation-paging/)、[007](specs/007-answer-countdown-color/)
  （001 與 002 的整合說明見 [002 plan.md「與 001 的整合」](specs/002-student-buzzer/plan.md)）
- 設計圖（PlantUML 與 PNG）：[diagrams/](diagrams/)
- 開發憲章：[.specify/memory/constitution.md](.specify/memory/constitution.md)

## 技術

| 目錄        | 內容                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `shared/`   | 前後端共用：搶答型別、錯誤碼與中文訊息、答案驗證規則（500 字上限）、學習單標註規則（003）、寫回與 CSV 規則（005） |
| `backend/`  | Node.js 26、TypeScript、Express 5、Socket.IO、zod 4、內建 `node:sqlite` 與 `crypto.scrypt`                        |
| `frontend/` | React 19、react-router 7、Vite、Tailwind CSS v4（搶答頁另有 `tokens.css`／`global.css`，色票相同）                |
| 測試        | Vitest（後端 supertest + socket.io-client、前端 Testing Library + jsdom）                                         |

## 前置需求

- Node.js 26 LTS（最低 24，需支援 `node:sqlite`）
- Java 21 與 `tools/plantuml.jar`（只在重新產生設計圖時需要；`.jar` 不進版控，請自行下載放到 `tools/`）

## 設定與啟動

```bash
cp .env.template .env
```

（Windows PowerShell 用 `Copy-Item .env.template .env`。）

`.env.template` 是進版控的**空白範本**，裡面的必填欄位都是空的；每個人要在**自己的 `.env`** 補上下列值才能執行。
`.env` 已列入 `.gitignore`，真實的密碼與金鑰只能寫在 `.env`，**不要填回 `.env.template` 或提交**（憲章原則 III）。
缺少必填值時，後端啟動會顯示缺少的變數名稱並停止。

| 變數                          | 是否必填        | 規則                                     | 怎麼取得                                                                           |
| ----------------------------- | --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `STUDENT_DEFAULT_PASSWORD`    | 必填            | 4–64 字元                                | 自訂；老師建立學生帳號時的統一預設密碼                                             |
| `TEACHER_INITIAL_PASSWORD`    | 必填            | 8–64 字元                                | 自訂；只在第一次 `db:seed` 建立老師帳號時使用                                      |
| `SESSION_SECRET`              | 必填            | 至少 32 字元的隨機字串                   | `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`    |
| `GOOGLE_CLIENT_ID`            | Google 功能需要 | 以 `.apps.googleusercontent.com` 結尾    | Google Cloud Console 建立的 OAuth 用戶端                                           |
| `GOOGLE_CLIENT_SECRET`        | Google 功能需要 | —                                        | 同上                                                                               |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Google 功能需要 | base64，解碼後恰好 32 bytes              | `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` |
| `GOOGLE_OAUTH_REDIRECT_URI`   | 選填            | `http(s)://` 開頭，須與 Console 設定一致 | 預設 `{CLIENT_ORIGIN}/api/google/oauth/callback`                                   |

其餘選填變數（`TEACHER_ACCOUNT`、`DATABASE_PATH`、`PORT` 等）留空即使用預設值，說明見 `.env.template`。

題目匯入（003）與寫回試算表（005）需要上表三個 Google 變數，三者須**全填或全空**；
OAuth 用戶端的建立步驟見 [003 quickstart.md §2](specs/003-sheets-question-import/quickstart.md)。
全部留空時系統照常啟動，只有 Google 相關功能顯示未設定。組員可以共用同一組 OAuth 用戶端，但請私下傳遞，不要放進 repo。

`ENABLE_DEV_TOOLS=true` 只會開啟後端的模擬 API（`/api/dev`，供整合測試使用）；前端已沒有開發工具畫面，`production` 下不得開啟。

```bash
npm install
```

```bash
npm run db:migrate --workspace backend
```

```bash
npm run db:seed --workspace backend
```

```bash
npm run dev
```

後端在 `http://localhost:3000`，前端在 `http://localhost:5173`（`/api` 與 `/socket.io` 代理至後端）。

1. 以 `TEACHER_ACCOUNT`（預設 `teacher`）與 `TEACHER_INITIAL_PASSWORD` 登入老師帳號，會直接進入「搶答活動」（`/teacher`）。
   用左上角三條線按鈕打開側邊選單，切換到其他畫面。
2. **學生管理**（`/teacher/students`）：建立學生帳號、設定組數與調整組別。
3. 學生以學號與預設密碼登入，選好組別後按「進入搶答」（`/student/buzzer`）。
4. **題目管理**（`/teacher/questions`）：連結 Google 帳號、讀取學習單，逐題標註後匯入題目集。
5. **搶答活動**（`/teacher`）：開始活動 → 選題並設定秒數 → 開始搶答 → 即時監控 → 時間到或結束搶答 →
   在結果畫面開放下一題（或重新開放）→ 結束活動。作答中看板含各組答案，請勿投影給學生。
   學生作答頁的倒數在最後 10 秒會由深藍轉為橘色，與老師看板同步。
6. 活動結束後（或進行中），在同一頁可「寫回 Google 試算表」或「匯出結果 CSV」。

詳細的驗證情境見各功能的 quickstart：
[001](specs/001-foundation-auth-groups/quickstart.md)、[002](specs/002-student-buzzer/quickstart.md)、
[003](specs/003-sheets-question-import/quickstart.md)、[004](specs/004-activity-control-monitor/quickstart.md)、
[005](specs/005-sheets-writeback-csv-export/quickstart.md)、[006](specs/006-teacher-nav-annotation-paging/quickstart.md)、
[007](specs/007-answer-countdown-color/quickstart.md)。

## 測試與檢查

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run typecheck
```

`npm test` 依序執行 shared、後端與前端的 Vitest，其中包含設計圖一致性檢查
（`backend/tests/architecture/diagram-consistency.test.ts`，涵蓋 001、003～007）。

## 重新產生設計圖

修改 `diagrams/*.puml` 後必須同步產生 PNG（憲章原則 VI）：

```bash
java -jar tools/plantuml.jar -charset UTF-8 "./diagrams/*.puml"
```
