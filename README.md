# 課程搶答系統

課堂搶答系統：老師與學生登入，學生以組別為單位搶答。本 repo 目前完成 **F0／F1／F2**：
專案基礎與米白／撞色 RWD 風格、老師建立的學號帳號與統一預設密碼登入、伺服器端 session 與角色權限、
以編號識別的組別管理（學生僅能在未分配時自選，老師可隨時調整）。

- 規劃：[roadmap.md](roadmap.md)
- 規格、計畫、任務：[specs/001-foundation-auth-groups/](specs/001-foundation-auth-groups/)
- 設計圖（PlantUML 與 PNG）：[diagrams/](diagrams/)
- 開發憲章：[.specify/memory/constitution.md](.specify/memory/constitution.md)

## 技術

| 部分 | 技術                                                                             |
| ---- | -------------------------------------------------------------------------------- |
| 後端 | Node.js 26、TypeScript、Express 5、zod、內建 `node:sqlite`、內建 `crypto.scrypt` |
| 前端 | React 19、react-router、Vite、Tailwind CSS v4                                    |
| 測試 | Vitest（後端 supertest、前端 Testing Library + jsdom）                           |

## 前置需求

- Node.js 26 LTS（最低 24，需支援 `node:sqlite`）
- Java 21 與根目錄的 `plantuml.jar`（只在重新產生設計圖時需要，不進版控）

## 設定與啟動

詳細步驟與手動驗證情境見 [quickstart.md](specs/001-foundation-auth-groups/quickstart.md)。

```bash
cp .env.template .env
```

在 `.env` 填入 `STUDENT_DEFAULT_PASSWORD`、`TEACHER_INITIAL_PASSWORD`、`SESSION_SECRET`（規則見 `.env.template`）。
`.env` 已列入 `.gitignore`，請勿提交。

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

後端在 `http://localhost:3000`，前端在 `http://localhost:5173`（`/api` 代理至後端）。
以 `TEACHER_ACCOUNT`（預設 `teacher`）與 `TEACHER_INITIAL_PASSWORD` 登入老師帳號。

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

`npm test` 依序執行後端與前端的 Vitest，其中包含設計圖一致性檢查
（`backend/tests/architecture/diagram-consistency.test.ts`）。

## 重新產生設計圖

修改 `diagrams/*.puml` 後必須同步產生 PNG（憲章原則 VI）：

```bash
java -jar plantuml.jar -charset UTF-8 "./diagrams/*.puml"
```
