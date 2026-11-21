# Quickstart & Validation: 基礎建設、登入權限與組別管理（F0／F1／F2）

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **API**: [contracts/openapi.yaml](contracts/openapi.yaml) | **UI**: [contracts/ui-routes.md](contracts/ui-routes.md)

本文件說明如何啟動、測試並以實際操作驗證本功能。實作細節見 `tasks.md`。

## 1. 前置需求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | 26 LTS（≥ 24 亦可，需支援 `node:sqlite`） | 前後端執行與測試 |
| npm | 隨 Node.js 安裝 | 套件管理（workspaces） |
| Java | 21（已安裝 Temurin JRE） | 產生設計圖 PNG |
| `plantuml.jar` | 1.2026.10，放在專案根目錄（不進版控） | 產生設計圖 PNG |

## 2. 設定

```bash
cp .env.template .env
```

於 `.env` 填入（實際值不得提交，見 [research.md](research.md) R10）：

- `STUDENT_DEFAULT_PASSWORD`：學生統一預設密碼
- `TEACHER_INITIAL_PASSWORD`：老師帳號初始密碼（≥ 8 字元）
- `SESSION_SECRET`：≥ 32 字元的隨機字串
- 選填：`TEACHER_ACCOUNT`、`DATABASE_PATH`、`PORT`、`SESSION_IDLE_MINUTES`

## 3. 安裝、初始化與啟動

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

- `db:seed` 建立老師帳號（已存在則略過，不覆蓋密碼）與 `group_settings`。
- `npm run dev` 同時啟動後端（`http://localhost:3000`）與前端（`http://localhost:5173`，`/api` 代理至後端）。

## 4. 自動化測試（憲章原則 IV、V）

```bash
npm test
```

預期：`backend` 與 `frontend` 兩個 workspace 的 Vitest 全數通過，輸出通過／失敗數量。完成回報時須附上此指令與實際結果。

個別執行：

```bash
npm test --workspace backend
```

```bash
npm test --workspace frontend
```

## 5. 啟動檢查驗證（FR-001）

1. 暫時將 `.env` 的 `SESSION_SECRET` 整行註解掉，執行 `npm run dev --workspace backend`。
2. **預期**：程式拒絕啟動，訊息列出 `SESSION_SECRET` 名稱、不顯示任何設定值，結束碼非 0。
3. 還原 `.env`。

## 6. 端對端手動驗證情境

以虛構資料操作，每步皆有預期結果。

| # | 操作 | 預期結果 | 對應 |
|---|------|----------|------|
| 1 | 以 `TEACHER_ACCOUNT`／`TEACHER_INITIAL_PASSWORD` 登入 | 進入 `/teacher` | US2-1 |
| 2 | 建立學生 `T0001`／測試甲 | 顯示「已建立 T0001 測試甲」，清單中組別為「未分配」 | US1-1 |
| 3 | 再建立 `t0001`／測試乙 | 顯示「學號 T0001 已存在」 | US1-5 |
| 4 | 建立學號 `T 01`、姓名空白 | 指出 `studentId` 格式錯誤與允許格式 | US1-6 |
| 5 | 將組數設為 3 | 組別總覽出現第 1–3 組（皆 0 人） | US4-1 |
| 6 | 另開無痕視窗，以 `T0001` + 預設密碼登入 | 進入 `/student`，顯示「尚未分組」與 1–3 組按鈕，無改密碼提示 | US1-2、US5-4 |
| 7 | 學生選第 2 組 | 顯示「你在第 2 組」，選組按鈕消失 | US3-1 |
| 8 | 學生端直接呼叫 `POST /api/groups/me` 選第 3 組 | 409「你已分組，如需更換請洽老師」 | US3-2 |
| 9 | 學生開啟 `/teacher` 或呼叫 `GET /api/students` | 「此功能僅限老師使用」／403 | US2-2 |
| 10 | 老師將組數設為 1 | 409，指出第 2 組仍有 T0001 | US4-4 |
| 11 | 老師將 T0001 改回未分配，學生重新整理 | 學生再次看到選組按鈕 | US4-3 |
| 12 | 學生以錯誤密碼連續登入 5 次 | 第 5 次起顯示「嘗試次數過多，請 N 分鐘後再試」 | FR-019 |
| 13 | 學生修改密碼為 8 字元以上新密碼 | 舊密碼無法登入、新密碼可登入 | US5-1 |
| 14 | 老師重設 T0001 密碼 | 學生所有視窗下次操作被導向登入頁；預設密碼可登入 | US5-3 |
| 15 | 任一使用者按登出 | 回登入頁；按瀏覽器返回也無法操作 | US2-4 |

## 7. RWD 與風格驗證（FR-003、FR-004、SC-006）

於瀏覽器開發者工具切換寬度 **375 px** 與 **1440 px**，逐一檢查 `/login`、`/teacher`、`/student`、`/account/password`：

- 無水平捲軸，所有按鈕可點擊且不小於 44×44 px。
- 背景為米白色系，主要按鈕為深藍撞色、次要按鈕為珊瑚橘。
- 觸發一個錯誤（例如空白登入），錯誤訊息樣式在各頁一致。

## 8. 設計圖產生與一致性驗證（憲章原則 VI）

```bash
java -jar plantuml.jar -charset UTF-8 "./diagrams/*.puml"
```

- 預期：`diagrams/` 中每個 `.puml` 都有同名且較新的 `.png`。
- 自動一致性檢查包含於 `npm test --workspace backend`（`tests/architecture/diagram-consistency.test.ts`）。
- 手動比對：依 [plan.md](plan.md)「設計圖對照表」逐項確認三張時序圖的步驟與實際程式流程一致，並記錄於完成回報。
