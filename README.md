# 課程搶答系統

老師開放題目、學生以組別搶答的課堂系統。功能規劃見 [roadmap.md](roadmap.md)，開發規範見 [.specify/memory/constitution.md](.specify/memory/constitution.md)。

目前已完成：**F1 登入與身分驗證／權限控管**（規格與驗證步驟見 [specs/001-user-login/](specs/001-user-login/)）。

## 專案結構

| 資料夾 | 內容 |
|--------|------|
| `backend/` | Node.js + TypeScript + Express 5，資料庫為 Node 內建 SQLite |
| `frontend/` | React + Vite + Tailwind CSS |
| `shared/` | 前後端共用的輸入驗證規則（zod）與錯誤代碼 |

## 需求

- Node.js 26 LTS 以上（`node -v`）

## 安裝與設定

```bash
npm install
```

```bash
cp .env.template .env
```

在 `.env` 填入自己的值（**不要提交**；`.env` 已列入 `.gitignore`）：

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | SQLite 檔案，例如 `file:./dev.db`（相對於 `backend/`） |
| `SESSION_SECRET` | 至少 32 字元的隨機字串 |
| `STUDENT_DEFAULT_PASSWORD` | 學生帳號的統一預設密碼（8–64 字元） |
| `TEACHER_INITIAL_PASSWORD` | 老師帳號的初始密碼（8–64 字元） |
| `TEACHER_USERNAME` | 選填，老師帳號名稱，預設 `teacher` |

缺少必要變數時，後端會列出缺少的變數名稱並停止啟動。

建立資料表並初始化老師帳號：

```bash
npm run db:migrate
```

```bash
npm run seed
```

## 開發

```bash
npm run dev
```

- 前端：<http://localhost:5173>（`/api` 會轉到後端 <http://localhost:3000>）
- 後端啟動時也會自動初始化老師帳號（已存在則不變動）

## 測試

```bash
npm test
```

測試使用記憶體資料庫與假密碼，不需要 `.env`。只跑後端或前端：

```bash
npm test -w backend
```

```bash
npm test -w frontend
```

其他檢查：

```bash
npm run lint
```

```bash
npm run typecheck -w backend
```

手動驗證情境見 [specs/001-user-login/quickstart.md](specs/001-user-login/quickstart.md)。
