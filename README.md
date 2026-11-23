# 課程搶答系統

課堂搶答系統：老師與學生登入，學生以組別為單位搶答。目前完成：

- **001-foundation-auth-groups（F0／F1／F2）**：米白／撞色 RWD 風格、老師建立的學號帳號與統一預設密碼登入、
  伺服器端 session 與角色權限、以編號識別的組別管理（學生僅能在未分配時自選，老師可隨時調整）。
- **002-student-buzzer（F7、F9 與 F6 學生端）**：學生以 001 帳號登入、已分組後進入搶答頁，
  依活動階段切換畫面；以組別送出、伺服器決定順位；斷線重連與伺服器重啟後回到正確畫面。
- **003-sheets-question-import（F3／F4）**：老師以自己的 Google 帳號授權後讀取雲端學習單，
  在格子上逐題點選題目格與作答格（單題與題組可混合、題數不限，不寫死儲存格），預覽後匯入為目前題目集；
  標註以看不到的 developer metadata 附在試算表上，插入或刪除列欄後仍對應原本的格子，重新匯入時自動帶回。

文件：

- 規劃：[roadmap.md](roadmap.md)
- 規格、計畫、任務：[specs/001-foundation-auth-groups/](specs/001-foundation-auth-groups/)、[specs/002-student-buzzer/](specs/002-student-buzzer/)、[specs/003-sheets-question-import/](specs/003-sheets-question-import/)
  （兩者的整合說明見 [002 plan.md「與 001 的整合」](specs/002-student-buzzer/plan.md)）
- 設計圖（PlantUML 與 PNG）：[diagrams/](diagrams/)
- 開發憲章：[.specify/memory/constitution.md](.specify/memory/constitution.md)

## 技術

| 目錄        | 內容                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `shared/`   | 前後端共用：搶答型別、錯誤碼與中文訊息、答案驗證規則（500 字上限）、學習單標註規則（003）          |
| `backend/`  | Node.js 26、TypeScript、Express 5、Socket.IO、zod 4、內建 `node:sqlite` 與 `crypto.scrypt`         |
| `frontend/` | React 19、react-router 7、Vite、Tailwind CSS v4（搶答頁另有 `tokens.css`／`global.css`，色票相同） |
| 測試        | Vitest（後端 supertest + socket.io-client、前端 Testing Library + jsdom）                          |

## 前置需求

- Node.js 26 LTS（最低 24，需支援 `node:sqlite`）
- Java 21 與根目錄的 `plantuml.jar`（只在重新產生設計圖時需要，不進版控）

## 設定與啟動

```bash
cp .env.template .env
```

在 `.env` 填入 `STUDENT_DEFAULT_PASSWORD`、`TEACHER_INITIAL_PASSWORD`、`SESSION_SECRET`（規則見 `.env.template`）。
開發時可設 `ENABLE_DEV_TOOLS=true` 以使用「模擬老師搶答操作」。`.env` 已列入 `.gitignore`，請勿提交。

題目匯入（003）需要 Google 串接：系統管理者一次性在 Google Cloud 建立 OAuth 用戶端後，於 `.env` 填入
`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_TOKEN_ENCRYPTION_KEY`（三者須全填或全空，選填
`GOOGLE_OAUTH_REDIRECT_URI`），步驟見 [003 quickstart.md §2](specs/003-sheets-question-import/quickstart.md)。
全部留空時系統照常啟動，只有題目匯入顯示未設定。

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

1. 以 `TEACHER_ACCOUNT`（預設 `teacher`）與 `TEACHER_INITIAL_PASSWORD` 登入老師帳號，建立學生並設定組數。
2. 學生以學號與預設密碼登入，選好組別後按「進入搶答」。
3. 老師管理頁的「題目管理」可連結 Google 帳號、讀取學習單並標註匯入題目。
4. 開發環境中，老師頁面的「模擬老師搶答操作（開發工具）」（`/dev`）可開放題目、時間到、結束、下一題、結束活動與重設。
   搶答活動目前仍使用 mock 的 3 題；F5 建立活動時才會從匯入的題目集複製題目。

詳細的驗證情境見 [001 quickstart.md](specs/001-foundation-auth-groups/quickstart.md)、[002 quickstart.md](specs/002-student-buzzer/quickstart.md) 與 [003 quickstart.md](specs/003-sheets-question-import/quickstart.md)。

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
（`backend/tests/architecture/diagram-consistency.test.ts`）。

## 重新產生設計圖

修改 `diagrams/*.puml` 後必須同步產生 PNG（憲章原則 VI）：

```bash
java -jar plantuml.jar -charset UTF-8 "./diagrams/*.puml"
```
