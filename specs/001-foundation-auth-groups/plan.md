# Implementation Plan: 基礎建設、登入權限與組別管理（F0／F1／F2）

**Branch**: `001-foundation-auth-groups` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-foundation-auth-groups/spec.md`

**Note**: This template is filled in by the `$speckit-plan` command; its definition describes the execution workflow.

## Summary

建立課程搶答系統的地基：前後端專案骨架與統一的米白／撞色 RWD 風格（F0）、由老師逐一建立的學號帳號與統一預設密碼登入、伺服器端 session 與角色權限（F1），以及以編號識別、無人數上限、學生僅能在未分配時自選、老師可隨時調整的組別管理（F2）。

技術做法：npm workspaces 單一 repo，後端 TypeScript + Express 5 + Node 內建 SQLite，前端 React + Vite + Tailwind CSS v4，全部以 Vitest 測試。架構嚴格依照 `./diagrams/001-*.puml` 設計圖（憲章原則 VI），各元素與檔案的對照見下方「設計圖對照表」。決策細節見 [research.md](research.md)。

## Technical Context

**Language/Version**: TypeScript 5.x（`strict: true`），執行於 Node.js 26 LTS（最低 24，需 `node:sqlite`）

**Primary Dependencies**:
- 後端：Express 5、zod（輸入驗證）、bcryptjs（密碼雜湊）、dotenv（開發時載入 `.env`）、tsx（開發執行）
- 前端：React 19、react-router、Vite、Tailwind CSS v4（`@tailwindcss/vite`）

**Storage**: SQLite（Node 內建 `node:sqlite`，WAL 模式），檔案位置由 `DATABASE_PATH` 設定，預設 `backend/data/app.db`（已被 `.gitignore` 的 `*.db` 規則排除）

**Testing**: Vitest（前後端）；後端加 supertest，前端加 @testing-library/react + jsdom

**Target Platform**: Node.js 伺服器（Windows／Linux 皆可）；瀏覽器端為近兩年主流手機與桌機瀏覽器

**Project Type**: Web application（frontend + backend）

**Performance Goals**: 60 位學生同時登入與選組，每人 3 秒內得到結果（SC-007）；單次登入雜湊 ≤ 100 ms

**Constraints**: 320–1920 px 無水平捲動、觸控區 ≥ 44 px（FR-004）；機敏設定只來自環境變數（憲章原則 III）；不得出現明文密碼於回應或 log（FR-020、SC-008）

**Scale/Scope**: 單一班級（約 60 位學生、1–數位老師）、組數 0–50、5 個前端頁面、13 個 API 端點、3 張資料表

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 檢查項目 | Phase 0 前 | Phase 1 後 | 依據 |
|------|----------|-----------|-----------|------|
| I. 輸入驗證 | 所有外部輸入（body、path、cookie、環境變數）在進入點以 zod 驗證，失敗即拒絕 | ✅ 規劃 | ✅ 每個端點於 [openapi.yaml](contracts/openapi.yaml) 定義 schema；環境變數於 R10 定義規則 | research R8、R10 |
| II. 清楚錯誤訊息 | 一致錯誤格式含 code／field／message／hint；不洩漏密碼、堆疊、帳號是否存在 | ✅ 規劃 | ✅ `ErrorResponse` schema 與各錯誤碼範例；500 固定訊息 | research R9、FR-018 |
| III. 機敏資料只放環境變數 | 預設密碼、老師密碼、session secret 只來自 `.env`；缺漏即停止；log 遮罩 | ✅ 規劃 | ✅ `.env.template` 將補齊變數名稱（不含值）；Logger 遮罩規則 | research R10、R11 |
| IV. 正常＋邊界案例測試 | 每個 FR 至少一個正常案例與一個邊界案例，含驗證失敗與錯誤訊息測試 | ✅ 規劃 | ✅ 測試分層與記憶體 DB、假時鐘策略已定 | research R13 |
| V. 回報測試指令與結果 | 單一指令 `npm test` 可重現 | ✅ 規劃 | ✅ 指令列於 [quickstart.md](quickstart.md) §4 | quickstart |
| VI. PlantUML 設計優先 | 組件圖、類別圖、時序圖存在且有 PNG；plan 以圖為藍圖；實作後驗證一致 | ✅ 5 張圖與 PNG 已存在 | ✅ 下方對照表逐一映射；偏離處（423、Clock、Config 欄位）已先更新圖並重新產生 PNG；一致性測試列入 R15 | research R9、R15 |

**Gate 結果**：全部通過，無需填寫 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/001-foundation-auth-groups/
├── plan.md              # 本文件
├── research.md          # Phase 0：技術決策
├── data-model.md        # Phase 1：資料表、驗證規則、狀態轉換
├── quickstart.md        # Phase 1：啟動、測試、手動驗證情境
├── contracts/
│   ├── openapi.yaml     # Phase 1：REST API 合約
│   └── ui-routes.md     # Phase 1：前端路由與存取規則
├── checklists/
│   └── requirements.md  # 規格品質檢查
└── tasks.md             # Phase 2（/speckit-tasks 產生）

diagrams/                # 設計藍圖（憲章原則 VI）
├── 001-component.puml / .png
├── 001-class.puml / .png
├── 001-sequence-login.puml / .png
├── 001-sequence-create-student.puml / .png
└── 001-sequence-group.puml / .png
```

### Source Code (repository root)

```text
package.json                     # npm workspaces: backend, frontend；scripts: dev, test, lint
.env.template                    # 補齊 R10 所列變數名稱（不含實際值）

backend/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── server.ts                # 進入點：載入 Config → 開 DB → migrate → listen
│   ├── app.ts                   # 建立 Express app、掛載路由與中介層（可注入相依以便測試）
│   ├── config/
│   │   └── env.ts               # Config
│   ├── domain/
│   │   ├── types.ts             # Role、User、Student、Session、GroupSettings、GroupSummary、CreateStudentInput
│   │   └── ports.ts             # PasswordHasher、各 Repository 介面
│   ├── lib/
│   │   ├── db.ts                # node:sqlite 連線與交易工具
│   │   ├── clock.ts             # Clock（系統時鐘／測試用假時鐘）
│   │   ├── errors.ts            # AppError 與錯誤碼
│   │   ├── logger.ts            # Logger（遮罩機敏欄位）
│   │   └── password.ts          # PasswordHasher（bcryptjs）
│   ├── db/
│   │   ├── migrations.ts        # schema_migrations 與 3 張表
│   │   ├── userRepository.ts    # UserRepository
│   │   ├── sessionRepository.ts # SessionRepository
│   │   └── groupSettingsRepository.ts # GroupSettingsRepository
│   ├── services/
│   │   ├── authService.ts       # AuthService
│   │   ├── sessionService.ts    # SessionService
│   │   ├── accountService.ts    # AccountService
│   │   └── groupService.ts      # GroupService
│   ├── middleware/
│   │   ├── requireAuth.ts       # RequireAuth
│   │   ├── requireRole.ts       # RequireRole
│   │   ├── validate.ts          # Validate
│   │   └── errorHandler.ts      # ErrorHandler
│   ├── routes/
│   │   ├── authRoutes.ts        # AuthRoutes  (/api/auth)
│   │   ├── studentRoutes.ts     # StudentRoutes (/api/students)
│   │   └── groupRoutes.ts       # GroupRoutes (/api/groups)
│   ├── schemas/                 # zod schemas（對應 openapi.yaml）
│   └── cli/
│       ├── migrate.ts           # npm run db:migrate
│       └── seed.ts              # npm run db:seed（AccountService.seedTeacher）
└── tests/
    ├── helpers/                 # 建立測試 app、記憶體 DB、假時鐘、登入輔助
    ├── unit/                    # Config、Logger 遮罩、驗證 schema、鎖定規則
    ├── integration/             # 各端點 supertest：auth、students、groups
    └── architecture/
        └── diagram-consistency.test.ts

frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts               # Tailwind 外掛、/api 代理、Vitest 設定
├── index.html
├── src/
│   ├── main.tsx                 # 進入點與路由表（ui-routes.md）
│   ├── styles/
│   │   └── theme.css            # UI 風格系統（Tailwind @theme tokens）
│   ├── api/
│   │   └── apiClient.ts         # ApiClient
│   ├── auth/
│   │   └── AuthContext.tsx      # 目前使用者狀態（/auth/me）與路由守衛
│   ├── components/
│   │   ├── ErrorMessage.tsx     # ErrorMessage
│   │   ├── Button.tsx           # 撞色按鈕（primary／secondary）
│   │   └── Layout.tsx           # 共用頁框（RWD 容器、登出按鈕）
│   └── pages/
│       ├── LoginPage.tsx        # LoginPage
│       ├── TeacherDashboard.tsx # TeacherDashboard
│       ├── StudentCreatePanel.tsx # StudentCreatePanel
│       ├── GroupManagePanel.tsx # GroupManagePanel
│       ├── StudentHome.tsx      # StudentHome
│       └── ChangePasswordForm.tsx # ChangePasswordForm
└── tests/                       # 各頁面行為測試（mock ApiClient）
```

**Structure Decision**: 採 Web application 結構（`backend/` + `frontend/`），以 npm workspaces 串接。後端分層（routes → middleware → services → repositories）與組件圖的「路由層／中介層／服務層／資料存取層」一一對應。`AuthContext`、`Button`、`Layout` 為前端的共用元件，屬於組件圖「UI 風格系統」與各頁面的實作細節，不另成獨立組件。

## 設計圖對照表（憲章原則 VI）

### 組件圖 → 檔案（[001-component.puml](../../diagrams/001-component.puml)）

| 組件 | 檔案 | 組件 | 檔案 |
|------|------|------|------|
| UI 風格系統 | `frontend/src/styles/theme.css` | AuthRoutes | `backend/src/routes/authRoutes.ts` |
| LoginPage | `frontend/src/pages/LoginPage.tsx` | StudentRoutes | `backend/src/routes/studentRoutes.ts` |
| TeacherDashboard | `frontend/src/pages/TeacherDashboard.tsx` | GroupRoutes | `backend/src/routes/groupRoutes.ts` |
| StudentCreatePanel | `frontend/src/pages/StudentCreatePanel.tsx` | RequireAuth | `backend/src/middleware/requireAuth.ts` |
| GroupManagePanel | `frontend/src/pages/GroupManagePanel.tsx` | RequireRole | `backend/src/middleware/requireRole.ts` |
| StudentHome | `frontend/src/pages/StudentHome.tsx` | Validate | `backend/src/middleware/validate.ts` |
| ChangePasswordForm | `frontend/src/pages/ChangePasswordForm.tsx` | ErrorHandler | `backend/src/middleware/errorHandler.ts` |
| ApiClient | `frontend/src/api/apiClient.ts` | AuthService | `backend/src/services/authService.ts` |
| ErrorMessage | `frontend/src/components/ErrorMessage.tsx` | SessionService | `backend/src/services/sessionService.ts` |
| Config | `backend/src/config/env.ts` | AccountService | `backend/src/services/accountService.ts` |
| Logger | `backend/src/lib/logger.ts` | GroupService | `backend/src/services/groupService.ts` |
| PasswordHasher | `backend/src/lib/password.ts` | UserRepository | `backend/src/db/userRepository.ts` |
| 資料庫 | SQLite（`backend/src/lib/db.ts`） | SessionRepository | `backend/src/db/sessionRepository.ts` |
| .env | 根目錄 `.env`（範本 `.env.template`） | GroupSettingsRepository | `backend/src/db/groupSettingsRepository.ts` |

### 類別圖 → 程式型別（[001-class.puml](../../diagrams/001-class.puml)）

| 類別圖元素 | 程式位置 |
|-----------|----------|
| `Role`、`User`、`Teacher`、`Student`、`Session`、`GroupSettings`、`GroupSummary`、`CreateStudentInput` | `backend/src/domain/types.ts`（純型別）；資料表見 [data-model.md](data-model.md) |
| `AppError` | `backend/src/lib/errors.ts` |
| `Config` | `backend/src/config/env.ts` |
| `Clock` | `backend/src/lib/clock.ts` |
| `PasswordHasher`、`UserRepository`、`SessionRepository`、`GroupSettingsRepository`（interface） | 介面定義於 `backend/src/domain/ports.ts`，實作見組件對照表 |
| `AuthService`、`SessionService`、`AccountService`、`GroupService` | 見組件對照表；公開方法名稱與類別圖相同 |
### 時序圖 → 程式流程

| 時序圖 | 端點（[openapi.yaml](contracts/openapi.yaml)） | 主要測試 |
|--------|------|----------|
| [001-sequence-login](../../diagrams/001-sequence-login.puml) | `POST /api/auth/login`、受保護請求的 RequireAuth → RequireRole | `tests/integration/auth.test.ts`、`tests/integration/authorization.test.ts` |
| [001-sequence-create-student](../../diagrams/001-sequence-create-student.puml) | `POST /api/students` | `tests/integration/students.test.ts` |
| [001-sequence-group](../../diagrams/001-sequence-group.puml) | `PUT /api/groups/settings`、`GET/POST /api/groups/me`、`PUT /api/groups/assignments/{studentId}` | `tests/integration/groups.test.ts` |

## 實作階段的一致性驗證（憲章原則 VI）

`/speckit-implement` 完成後必須：

1. 執行 `npm test --workspace backend`，其中 `diagram-consistency.test.ts` 自動確認組件圖與類別圖的每個元素在上方對照表的檔案中存在對應匯出，且程式中沒有對照表以外的路由／服務／repository 檔案。
2. 依三張時序圖逐步比對實際程式流程（呼叫順序、錯誤碼、分支），於完成回報列出結果。
3. 若實作需偏離設計，先修改 `.puml`、重新產生 PNG、更新本對照表，再修改程式碼。

## Post-Design Constitution Re-check

Phase 1 產出（data-model、contracts、quickstart）完成後重新檢查上方表格：六項原則皆維持 ✅。設計過程中的兩處偏離——帳號鎖定改用 423、類別圖補上 `Clock` 與 `Config` 欄位、`User.failedWindowStartedAt`——皆已先更新設計圖並重新產生 PNG，符合原則 VI。

## Complexity Tracking

無違反憲章之處，不需填寫。
