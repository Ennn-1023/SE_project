# Implementation Plan: 登入與身分驗證／權限控管（F1）

**Branch**: `001-user-login` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-user-login/spec.md`

## Summary

實作課程搶答系統的登入與權限控管：老師由系統初始化建立；老師逐一新增、檢視、刪除學生帳號並可重設學生密碼；學生以 9 位數字學號＋統一預設密碼登入（不強制改密碼、不限制失敗次數）；登入後依資料庫記錄的身分類別導向老師頁或學生頁，所有老師功能由後端檢查角色。

技術做法：npm workspaces 單一 repo，`backend`（Node.js + TypeScript + Express 5 + Prisma/SQLite）、`frontend`（React + Vite + Tailwind CSS）、`shared`（前後端共用的 zod 驗證 schema 與錯誤 code）。伺服器端 session（HttpOnly 簽章 cookie，DB 只存 token 雜湊）以便登出／改密碼／重設／刪除時立即失效；密碼以 Node 內建 scrypt 雜湊。全部測試使用 Vitest。詳見 [research.md](research.md)。

## Technical Context

**Language/Version**: TypeScript 5（`strict`），Node.js 22 LTS（後端）；瀏覽器端由 Vite 編譯

**Primary Dependencies**: 後端 Express 5、Prisma（SQLite）、zod、cookie-parser、pino；前端 React 19、Vite、Tailwind CSS v4、React Router；共用 zod

**Storage**: SQLite（Prisma ORM），連線由 `DATABASE_URL` 提供；日後可換 PostgreSQL

**Testing**: Vitest（後端 + supertest 整合測試；前端 + jsdom + React Testing Library）

**Target Platform**: Node.js 22 伺服器；手機／平板／電腦的現代瀏覽器（RWD）

**Project Type**: Web application（frontend + backend + shared）

**Performance Goals**: 50 人班級在 2 分鐘內同時登入，每位等待 ≤ 2 秒（SC-002）；新增學生 ≤ 20 秒完成（SC-003）

**Constraints**: 機敏值只來自環境變數；session 可立即撤銷；閒置 2 小時／最長 12 小時逾時；request body ≤ 10 KB；375px–1440px 無水平捲動、按鈕 ≥ 44px

**Scale/Scope**: 單一班級約 50 名學生、1 位老師；5 個前端頁面、8 個 API 端點

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 本計畫如何符合 | 狀態 |
|------|----------------|------|
| I. 輸入驗證（不可妥協） | 所有 API 輸入在路由進入點以 `shared/` zod schema 驗證（必填、型別、格式、長度）；環境變數啟動時驗證；body 上限 10 KB；驗證失敗即中止，不靜默修正（只有規格明定的去除前後空白） | ✅ |
| II. 清楚的錯誤訊息 | 統一錯誤格式 `{ error: { code, message, hint, details[] } }`，含欄位、原因與修正提示；固定狀態碼對照表（[contracts/api.md](contracts/api.md)）；500 不回傳 stack trace；登入失敗訊息刻意不分帳號／密碼（規格要求的安全例外，仍說明如何修正） | ✅ |
| III. 機敏資料只放環境變數（不可妥協） | `STUDENT_DEFAULT_PASSWORD`、`TEACHER_INITIAL_PASSWORD`、`SESSION_SECRET`、`DATABASE_URL` 只從環境變數讀取；缺少時列出名稱並停止；`.env.template` 只列名稱；pino `redact` 遮罩密碼與 cookie；DB 只存密碼雜湊與 token 雜湊；測試使用假值 | ✅ |
| IV. 正常與邊界案例測試（不可妥協） | 每個使用者故事有正常案例；邊界案例涵蓋空值、8／10 碼學號、全形數字、開頭 0、超長輸入、重複新增、併發新增、逾時、已刪除帳號、學生呼叫老師 API；驗證錯誤與訊息皆有測試 | ✅ |
| V. 回報測試指令與結果 | 統一 `npm test`（另有 `-w backend`／`-w frontend`），見 [quickstart.md](quickstart.md)；實作完成時回報實際輸出 | ✅ |
| 安全與資料處理 | 套件來自 npm 官方並以 `package-lock.json` 鎖定；測試資料為虛構學號 | ✅ |

**Gate 結果（Phase 0 前）**：通過，無違反事項。

**Post-design re-check（Phase 1 後）**：data model、API contract、quickstart 皆未引入違反事項。規格決定「不限制登入失敗次數」（FR-010）不違反憲章，風險已記錄於 spec Assumptions 與 [research.md R7](research.md)。**通過**。

## Project Structure

### Documentation (this feature)

```text
specs/001-user-login/
├── plan.md              # 本檔
├── research.md          # Phase 0：技術決策
├── data-model.md        # Phase 1：User / Session / SecurityEvent 與驗證規則
├── quickstart.md        # Phase 1：設定、測試指令、手動驗證情境
├── contracts/
│   └── api.md           # Phase 1：REST API 與前端路由合約
├── checklists/
│   └── requirements.md  # 規格品質檢查
└── tasks.md             # Phase 2（/speckit-tasks 產生，非本指令）
```

### Source Code (repository root)

```text
package.json                 # npm workspaces: backend, frontend, shared；scripts: dev, test, seed, db:migrate
.env.template                # 補上 F1 所需變數名稱（不含值）

shared/
├── package.json
└── src/
    ├── schemas/auth.ts      # loginInput, changePasswordInput
    ├── schemas/students.ts  # createStudentInput, studentIdParam
    ├── errors.ts            # 錯誤 code 列舉與 ErrorResponse 型別
    └── index.ts

backend/
├── package.json
├── prisma/
│   └── schema.prisma        # User, Session, SecurityEvent
├── src/
│   ├── config/env.ts        # 環境變數驗證（缺少即停止）
│   ├── lib/password.ts      # scrypt 雜湊與比對
│   ├── lib/clock.ts         # 可注入時鐘（測試逾時用）
│   ├── lib/logger.ts        # pino + redact
│   ├── middleware/
│   │   ├── requireAuth.ts   # 讀 cookie、檢查 session 有效與逾時
│   │   ├── requireRole.ts   # 依 User.role 判斷 403
│   │   ├── validate.ts      # zod 驗證 → VALIDATION_ERROR
│   │   └── errorHandler.ts  # 統一錯誤格式
│   ├── services/
│   │   ├── authService.ts   # 登入、登出、改密碼
│   │   ├── sessionService.ts
│   │   ├── studentService.ts# 新增、列表、刪除、重設
│   │   └── auditService.ts  # SecurityEvent
│   ├── routes/
│   │   ├── auth.ts
│   │   └── students.ts
│   ├── seed.ts              # 老師帳號初始化（冪等）
│   ├── app.ts               # 建立 Express app（測試直接引用）
│   └── server.ts            # 讀 env、seed、listen
└── tests/
    ├── unit/                # env, password, schemas, session 逾時
    └── integration/         # auth.test.ts, students.test.ts, rbac.test.ts

frontend/
├── package.json
├── vite.config.ts           # /api proxy、Vitest 設定（jsdom）
├── index.html
├── src/
│   ├── styles/index.css     # Tailwind v4 @theme：米白底、深藍／珊瑚橘撞色按鈕
│   ├── api/client.ts        # fetch 包裝，401 → 導向 /login
│   ├── auth/AuthContext.tsx # 目前使用者
│   ├── auth/RequireRole.tsx # 路由守衛
│   ├── components/          # Button, TextField, ConfirmDialog, ErrorMessage
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── TeacherHomePage.tsx
│   │   ├── StudentsPage.tsx # 清單、新增、刪除、重設
│   │   ├── StudentHomePage.tsx
│   │   └── ChangePasswordPage.tsx
│   ├── App.tsx              # 路由
│   └── main.tsx
└── tests/                   # LoginPage, StudentsPage, ChangePasswordPage, RequireRole
```

**Structure Decision**: 採用 web application 結構（`backend/` + `frontend/`），另加 `shared/` 讓前後端共用驗證規則與錯誤 code，確保憲章原則 I 的規則只有一份。由於 F0 尚未實作，本功能一併建立上述最小骨架（workspaces、env 檢查、錯誤格式、design tokens、Vitest 設定），見 [research.md R13](research.md)。

## Complexity Tracking

無憲章違反事項，不需填寫。
