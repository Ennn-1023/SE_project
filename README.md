# 課程搶答系統（SE Project）

課堂即時搶答系統。目前完成 **001-student-buzzer：學生端搶答**（roadmap F7、F9 與 F6 學生端部分），
規格與設計見 [`specs/001-student-buzzer/`](specs/001-student-buzzer/)，架構圖見 [`diagrams/`](diagrams/)。

| 目錄 | 內容 |
|------|------|
| `shared/` | 前後端共用：型別、錯誤碼與中文訊息、答案驗證規則（500 字上限） |
| `backend/` | Express + TypeScript + Socket.IO + SQLite（Node 內建 `node:sqlite`） |
| `frontend/` | React + Vite，米白底色＋撞色按鈕、mobile-first RWD |

## 1. 安裝

需要 **Node.js 22 以上**（開發時使用 Node 26 LTS）：

```powershell
winget install OpenJS.NodeJS.LTS
```

```powershell
npm install
```

## 2. 設定環境變數

```powershell
Copy-Item .env.template .env
```

在 `.env` 填入 `SESSION_SECRET`（至少 32 字元的隨機字串），可以用下列指令產生：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

開發時設定 `ENABLE_DEV_TOOLS=true` 才能使用 mock 登入與模擬老師操作。
`.env` 已列入 `.gitignore`，**不可提交**。缺少必要變數時，後端會列出變數名稱並停止。

## 3. 啟動

```powershell
npm run dev
```

- 後端：http://localhost:3000
- 前端：http://localhost:5173

第一次啟動會在 `backend/data/buzzer.db` 建立資料庫，並寫入 mock 資料：3 題、4 組，其中第 1 組有 2 位學生，另有 1 位未分組學生。

### 開發工具頁 `/dev`

1. 開啟 http://localhost:5173/dev ，選擇 mock 學生後登入，會進入學生搶答頁。
2. 在另一個分頁（或無痕視窗）再開一次 `/dev`，用右側的「模擬老師操作」面板：開放題目（可設定 5–600 秒）、時間到、手動結束、下一題、結束活動、重設。
3. 每題的結果可以在 `GET /api/dev/results` 查看。

## 4. 測試

| 範圍 | 指令 |
|------|------|
| 全部 | `npm test` |
| shared | `npm run test -w shared` |
| 後端 | `npm run test -w backend` |
| 前端 | `npm run test -w frontend` |
| Lint | `npm run lint` |

完整的驗收情境見 [quickstart.md](specs/001-student-buzzer/quickstart.md)。
