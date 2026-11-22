# Implementation Plan: 學生端搶答系統（Student Buzzer）

**Branch**: `001-student-buzzer` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-student-buzzer/spec.md`

## Summary

學生端搶答系統：學生畫面依伺服器的活動階段（等待開放／作答中／已結束／活動結束）切換；每組由一位代表送出答案，每組每題只能送出一次，順位依伺服器收到的先後決定；作答中後端依組別過濾推播，不外流他組資料；結束後揭曉所有組別的答案與本組成敗；重新整理或重連後自動回到正確畫面。

技術作法：
- **後端**：Express + TypeScript 負責 REST（送出、取回狀態、dev 工具），Socket.IO 依組別 room 推播狀態。
- **狀態**：伺服器端狀態機與記憶體中的送出表處理作答中資料；題目結束時以單一交易寫入 SQLite。
- **前端**：React + Vite 依 `phase` 切換畫面，並以 `serverNow` 校正倒數。
- **開發工具**：提供 mock 資料、mock 登入與模擬老師操作，讓學生端可以單獨測試。

## Technical Context

**Language/Version**: TypeScript 6.0（strict）on Node.js 26 LTS（≥ 22）；前端 TypeScript + React 19（實作時的版本調整見 research.md 末節）

**Primary Dependencies**:
- 後端：express 5、socket.io、Node 內建 node:sqlite、zod、jsonwebtoken、cors
- 前端：react、react-dom、vite、socket.io-client
- 共用：`shared/`（型別、常數、答案驗證）

**Storage**: SQLite（Node 內建 `node:sqlite`）。作答中的送出只放記憶體；已結束題目的資料以交易寫入資料庫（見 research R5）

**Testing**: Vitest（前後端）、supertest、socket.io-client（整合測試）、@testing-library/react + jsdom

**Target Platform**: 後端為 Node.js 伺服器（Windows／Linux）；前端為現代行動與桌面瀏覽器（Chrome、Safari、Edge 最新兩版）

**Project Type**: Web application（frontend + backend + shared）

**Performance Goals**: 階段變化後 1 秒內同步到所有學生（SC-001）；不同裝置的剩餘時間差 ≤ 1 秒（SC-002）；重連後 3 秒內回到正確畫面（SC-006）

**Constraints**: 伺服器為唯一真實來源；作答中不得推送他組資料；作答中重啟時捨棄該題資料；答案上限 500 字（code point）；按鈕觸控區 ≥ 44px；375px 至 1440px 寬度無水平捲動

**Scale/Scope**: 同時只有一場活動；10 組，每組 1 位登入者（約 10 至 20 個連線，含多分頁）；學生端 4 種畫面，外加 2 個 dev 頁面

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 本計畫的對應做法 | 結果 |
|------|------------------|------|
| I. 輸入驗證 | 所有進入點都以 zod 驗證：送出 body、dev 登入、模擬老師操作（questionId 存在、秒數為 5–600 的整數）、Socket handshake token、環境變數。答案規則放在 `shared/`，前後端共用，伺服器端為最終判定 | ✅ |
| II. 清楚錯誤訊息 | 統一格式 `{ error: { code, field, message, hint } }`，搭配 400／401／403／404／409；每個錯誤碼都有中文訊息與修正提示（見 contracts/rest-api.md）；不回傳 stack trace | ✅ |
| III. 機敏資料只放環境變數 | `SESSION_SECRET` 只來自環境變數，啟動時檢查是否存在與長度；`.env.template` 補上變數名稱；log 不記錄 token；mock 資料皆為虛構 | ✅ |
| IV. 正常與邊界案例測試 | 每個 user story 都有 happy path 測試，並涵蓋邊界案例：空白答案、500／501 字、重複送出、結束後送出、同時送出、他組資料隔離、作答中重啟。驗證與錯誤訊息都有測試覆蓋（見 quickstart） | ✅ |
| V. 回報測試指令與結果 | quickstart 列出 `npm test`、`npm run test -w backend`、`npm run test -w frontend` 等可直接複製的指令；實作完成時回報實際執行結果 | ✅ |
| 安全與資料處理 | 套件來自 npm 官方並以 `package-lock.json` 鎖定版本；dev 工具在 production 禁止啟用；前端禁用 `dangerouslySetInnerHTML` | ✅ |
| 流程品質關卡 | spec 已列出輸入欄位與驗證規則、錯誤情境；本 plan 與 contracts 補上錯誤訊息、環境變數與測試清單 | ✅ |

**Gate 結果**：通過，沒有需要豁免的項目。

**Phase 1 設計後複查**：data-model、contracts、quickstart 完成後重新檢查——所有輸入都有對應的驗證規則與錯誤碼（contracts/rest-api.md 的錯誤碼表），環境變數表完整（research R11），測試清單涵蓋原則 IV 的要求（quickstart 的「驗證情境」）。**仍然通過。**

## Project Structure

### Documentation (this feature)

```text
specs/001-student-buzzer/
├── spec.md
├── plan.md              # 本檔
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── rest-api.md      # 學生 API + dev API + 錯誤碼
│   └── socket-events.md # Socket.IO 事件與 payload
├── checklists/requirements.md
└── tasks.md             # Phase 2（/speckit-tasks 產生）

diagrams/
├── student-component.puml / .png
├── student-class.puml / .png
└── student-sequence.puml / .png
```

### Source Code (repository root)

```text
package.json                 # npm workspaces: shared, backend, frontend
shared/
└── src/
    ├── types.ts             # ActivityPhase, StudentView, TeamAnswer, ErrorBody…
    ├── answerRules.ts       # MAX_ANSWER_LENGTH=500, validateAnswer()
    └── errorCodes.ts        # 錯誤碼與中文訊息

backend/
├── src/
│   ├── config/env.ts                # zod 驗證環境變數
│   ├── domain/
│   │   ├── activityStateMachine.ts  # 階段轉換、計時器、冪等 close
│   │   ├── submissionService.ts     # 同步送出、順位
│   │   ├── visibilityFilter.ts      # buildView(activity, teamId)
│   │   └── resultService.ts         # 產生 QuestionResult
│   ├── data/
│   │   ├── db.ts                    # better-sqlite3 連線與 schema
│   │   ├── repositories.ts          # activity / result 讀寫（交易）
│   │   └── mock/seed.ts             # mock 題目、組別、學生
│   ├── http/
│   │   ├── app.ts
│   │   ├── middleware/{auth.ts, errorHandler.ts}
│   │   └── routes/{student.ts, devAuth.ts, devTeacher.ts}
│   ├── realtime/socketServer.ts     # 驗證 handshake、加入 room、依組推播
│   └── server.ts                    # 啟動與恢復（ANSWERING → WAITING）
└── tests/
    ├── unit/
    └── integration/

frontend/
├── index.html
├── src/
│   ├── styles/tokens.css            # F0 色票、斷點、觸控尺寸
│   ├── api/client.ts
│   ├── realtime/socket.ts
│   ├── hooks/{useStudentState.ts, useServerCountdown.ts}
│   ├── components/{WaitingView, AnsweringView, ResultView,
│   │               ActivityEndedView, AnswerInput, CountdownTimer,
│   │               ConnectionBanner}.tsx
│   └── pages/{StudentPage, DevLoginPage, DevTeacherPanel}.tsx
└── tests/
```

**Structure Decision**: 採用 web application 結構（`backend/` + `frontend/`），另外增加 `shared/` 存放前後端共用的型別、答案規則與錯誤碼，確保「500 字上限」與錯誤訊息只定義一次。dev 工具（mock 登入、模擬老師操作）放在後端 `routes/dev*` 與前端 `pages/Dev*`，以 `ENABLE_DEV_TOOLS` 控制是否啟用。

## Complexity Tracking

> 無違反憲章的項目，不需填寫。
