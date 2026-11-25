# Implementation Plan: 老師端側邊選單導覽與題目標註逐題切換

**Branch**: `006-teacher-nav-annotation-paging` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-teacher-nav-annotation-paging/spec.md`

## Summary

本功能只改前端介面，分成兩件事：

1. **老師端導覽**
   - 老師主頁 `/teacher` 直接顯示搶答活動（`ActivityControlPage`）。
   - 所有老師畫面都改用新的 `TeacherLayout` 頁框：頁首左上角有三條線按鈕，按下後左側滑出 `SideMenu` 抽屜，列出搶答活動、題目管理、學生管理三項。
   - 原本的 `TeacherDashboard` 改名為 `StudentManagePage`，網址改為 `/teacher/students`，內容是學生帳號與組別管理。
   - 移除前端的 `DevTeacherPanel` 與 `/dev` 路由。後端的 `/api/dev` 保留（Clarifications Q2）。
2. **標註逐題切換**
   - `useAnnotationEditor` 新增「目前這一題」狀態（`currentKey`），以及 `goTo`、`goPrev`、`goNext`。新增、刪除、上下移動題目時一併維護目前這一題。
   - `AnnotationPanel` 只渲染目前這一題，上方加 `QuestionPager`（上一題／下一題、第 X 題／共 N 題）和 `QuestionOverview`（題號按鈕，標出有錯誤的題目）。
   - `SheetGrid` 讓目前這一題的角標比其他題醒目。

**不改**：資料格式、後端 API、資料庫。架構依 `./diagrams/006-*.puml`（憲章原則 VI），各項決策見 [research.md](research.md)。

## Technical Context

**Language/Version**：TypeScript 6（`strict: true`），沿用。

**Primary Dependencies**：沿用 React 19、react-router 7、Tailwind v4。**不新增套件**：抽屜選單自己實作，見 research R3。

**Storage**：不需要。「目前這一題」與選單開關都只是畫面上的狀態。

**Testing**：
- 前端：Vitest＋Testing Library。
- 架構測試 `backend/tests/architecture/diagram-consistency.test.ts` 擴充到 006。
- 後端測試不受影響，`/api/dev` 照舊。

**Target Platform**：近兩年主流的手機、平板、桌機瀏覽器，最窄 360px。

**Project Type**：Web application（frontend＋backend＋shared），本功能只動 frontend。

**Performance Goals**：
- 打開選單、切換題目都是本機狀態變更，沒有網路往返，畫面要立即反應。
- 30 題時標註區的高度與 1 題時相近（SC-002）。

**Constraints**：
- 不改標註資料、驗證規則與草稿自動儲存（FR-024）。
- 學生端畫面完全不變（FR-007）。
- 點擊區至少 44×44px。
- 360px 寬時不出現水平捲動（SC-005）。

**Scale/Scope**：
- 新增 4 個元件：`TeacherLayout`、`SideMenu`、`QuestionPager`、`QuestionOverview`。
- 1 個頁面改名：`TeacherDashboard` → `StudentManagePage`。
- 刪除 1 個頁面：`DevTeacherPanel`。
- 調整路由表，修改 `AnnotationPanel` 和 `SheetGrid`。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 檢查項目 | Phase 0 前 | Phase 1 後 | 依據 |
|------|----------|-----------|-----------|------|
| I. 輸入驗證 | 沒有新的外部輸入。題號仍由 003 的 `validateAnnotations` 驗證；`goTo(key)` 遇到不存在的 key 時不動作。新路由 `/teacher/students` 由 `Guard(role=TEACHER)` 保護，後端 001 的權限檢查不變 | ✅ | ✅ [ui-routes.md](contracts/ui-routes.md) | R4、R6 |
| II. 清楚錯誤訊息 | 非老師開啟老師畫面時，沿用「此功能僅限老師使用」；舊的 `/dev` 顯示「找不到這個頁面」；標註錯誤沿用 003 的訊息，總覽另以「⚠」符號標示 | ✅ | ✅ ui-routes §3、§4 | R7 |
| III. 機敏資料只放環境變數 | 不新增任何設定或機敏資料 | ✅ 無新增 | ✅ | — |
| IV. 正常＋邊界案例測試 | 每條 FR 都有正常與邊界測試，包括：只有一題、刪除最後一題、刪光、步驟進行中切題、Esc 與點選外部關閉選單、學生被拒、`/dev` 404、360px | ✅ | ✅ [quickstart.md §2](quickstart.md) | R9 |
| V. 回報測試指令與結果 | `npm test`、`npm run typecheck`、`npm run lint` | ✅ | ✅ quickstart §1 | — |
| VI. PlantUML 設計優先 | specify 階段已產生 4 張圖。plan 階段為了讓類別圖能逐項對照程式碼，把類別圖改成 Props 介面與屬性形式，並重新產生 PNG。001／003／004 組件圖裡的 `TeacherDashboard`、student-component 裡的 `DevTeacherPanel`，在實作時同步修改（R8） | ✅ 4 張圖＋PNG | ✅ 下方對照表；架構測試加入 006 | R1、R8 |

**Gate 結果**：全部通過，不需要填 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/006-teacher-nav-annotation-paging/
├── plan.md              # 本文件
├── research.md          # Phase 0：設計決策 R1～R9
├── data-model.md        # Phase 1：畫面狀態（導覽項目、目前這一題）與轉換規則
├── quickstart.md        # Phase 1：測試指令與手動驗證情境
├── contracts/
│   └── ui-routes.md     # 路由表、側邊選單與逐題切換的畫面合約
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2（由 /speckit-tasks 產生）

diagrams/
├── 006-component.puml / .png
├── 006-class.puml / .png
├── 006-sequence-navigation.puml / .png
└── 006-sequence-annotation-paging.puml / .png
```

### Source Code (repository root)

```text
frontend/src/
├── main.tsx                            # 路由：/teacher → ActivityControlPage；/teacher/activity → 導向 /teacher；
│                                       #       新增 /teacher/students；移除 /dev 與 DevTeacherPanel import
├── components/
│   ├── Layout.tsx                      # 新增選填的 leading 插槽（頁首最左側），學生端不傳
│   ├── TeacherLayout.tsx               # 新增：Layout＋三條線按鈕＋SideMenu；持有 menuOpen
│   ├── SideMenu.tsx                    # 新增：左側抽屜、遮罩、Esc／點外部關閉、焦點管理
│   └── teacherNav.ts                   # 新增：TeacherNavItem、TEACHER_NAV_ITEMS、isCurrentNav
├── pages/
│   ├── StudentManagePage.tsx           # 由 TeacherDashboard.tsx 改名；移除舊的入口按鈕與開發工具連結
│   ├── TeacherDashboard.tsx            # 刪除
│   ├── DevTeacherPanel.tsx             # 刪除
│   ├── ActivityControlPage.tsx         # Layout → TeacherLayout
│   └── QuestionManagePage.tsx          # Layout → TeacherLayout；移除「學生帳號與組別管理」連結；
│                                       #   marksFor(doc, editor.currentKey)
├── activity/ActivityStartPanel.tsx     # 「前往組別管理」改連到 /teacher/students
└── questions/
    ├── AnnotationPanel.tsx             # useAnnotationEditor 加 currentKey 等；只渲染目前這一題；
    │                                   #   overviewOf()；marksFor(doc, currentKey)；「前往第 N 題」
    ├── QuestionPager.tsx               # 新增
    ├── QuestionOverview.tsx            # 新增
    └── SheetGrid.tsx                   # CellMark.current → 醒目樣式

frontend/tests/
├── TeacherLayout.test.tsx、SideMenu.test.tsx                  # 新增
├── StudentManagePage.test.tsx                                 # 新增（取代舊 TeacherDashboard 相關斷言）
├── QuestionPager.test.tsx、QuestionOverview.test.tsx          # 新增
├── AnnotationPanel.test.tsx、QuestionManagePage.test.tsx      # 擴充：逐題切換
├── SheetGrid.test.tsx                                         # 擴充：current 角標
├── routeGuards.test.tsx、LoginPage.test.tsx、narrowScreen.test.tsx  # 更新：/teacher 為搶答活動、/dev 404
└── DevTeacherPanel.test.tsx                                   # 刪除（畫面已移除）

backend/tests/architecture/diagram-consistency.test.ts         # 加入 006；001/003/004 改對 StudentManagePage
diagrams/001-component.puml、003-component.puml、004-component.puml、student-component.puml  # R8 同步改名／移除
specs/001-…/plan.md、003-…/plan.md、004-…/plan.md             # 組件對照表 TeacherDashboard → StudentManagePage
```

**Structure Decision**：
- 共用頁框放 `components/`，頁面放 `pages/`，標註相關放 `questions/`，沿用 001～005 的前端慣例。
- `TeacherLayout` 包住既有的 `Layout`，不另寫一份頁首，學生端因此不受影響。
- 「目前這一題」放在既有的 `useAnnotationEditor`，不另開 hook。理由：新增、刪除、移動題目和取消步驟本來就在這裡處理，放在一起才能保證 FR-016～FR-019 的狀態一致（R5）。

## 設計圖對照表（憲章原則 VI）

### 組件圖 → 檔案（[006-component.puml](../../diagrams/006-component.puml)）

| 組件 | 檔案 | 組件 | 檔案 |
|------|------|------|------|
| AppRoutes | `frontend/src/main.tsx` | 路由守衛 | `frontend/src/main.tsx` |
| TeacherLayout | `frontend/src/components/TeacherLayout.tsx` | SideMenu | `frontend/src/components/SideMenu.tsx` |
| Layout | `frontend/src/components/Layout.tsx` | ActivityControlPage | `frontend/src/pages/ActivityControlPage.tsx` |
| QuestionManagePage | `frontend/src/pages/QuestionManagePage.tsx` | StudentManagePage | `frontend/src/pages/StudentManagePage.tsx` |
| StudentCreatePanel | `frontend/src/pages/StudentCreatePanel.tsx` | GroupManagePanel | `frontend/src/pages/GroupManagePanel.tsx` |
| AnnotationPanel | `frontend/src/questions/AnnotationPanel.tsx` | QuestionPager | `frontend/src/questions/QuestionPager.tsx` |
| QuestionOverview | `frontend/src/questions/QuestionOverview.tsx` | 標註編輯狀態 | `frontend/src/questions/AnnotationPanel.tsx` |
| SheetGrid | `frontend/src/questions/SheetGrid.tsx` | 既有 API（001～005） | `backend/src/app.ts` |
| Dev 模擬 API /api/dev | `backend/src/http/routes/devTeacher.ts` | | |

「路由守衛」是 `main.tsx` 裡的內部函式 `Guard`；「標註編輯狀態」是 `AnnotationPanel.tsx` 匯出的 `useAnnotationEditor`。

### 類別圖 → 程式型別（[006-class.puml](../../diagrams/006-class.puml)）

| 類別圖元素 | 程式位置 |
|-----------|----------|
| `TeacherNavItem` | `frontend/src/components/teacherNav.ts`（同檔匯出 `TEACHER_NAV_ITEMS`） |
| `TeacherLayoutProps` | `frontend/src/components/TeacherLayout.tsx` |
| `SideMenuProps` | `frontend/src/components/SideMenu.tsx` |
| `AnnotationEditor`、`QuestionOverviewItem` | `frontend/src/questions/AnnotationPanel.tsx` |
| `CellMark` | `frontend/src/questions/SheetGrid.tsx` |
| `AnnotationDocument` | `shared/src/annotation.ts`（003，不改） |

### 基礎設施檔案允許清單

| 檔案 | 角色 |
|------|------|
| `frontend/src/activity/ActivityStartPanel.tsx` | 只改「前往組別管理」的連結目標 |

本功能不新增後端檔案，因此後端 routes／services／db 的允許清單沒有變動。

### 時序圖 → 程式流程

| 時序圖 | 程式流程 | 主要測試 |
|--------|----------|----------|
| [006-sequence-navigation](../../diagrams/006-sequence-navigation.puml)：登入落地、開關選單、切換畫面 | `LoginPage` → `homePathFor` → `/teacher`；`TeacherLayout` ↔ `SideMenu` | `routeGuards.test.tsx`、`LoginPage.test.tsx`、`SideMenu.test.tsx`、`TeacherLayout.test.tsx` |
| [006-sequence-annotation-paging](../../diagrams/006-sequence-annotation-paging.puml)：新增、切換、前往、刪除、總覽 | `useAnnotationEditor` 的 `addQuestion`／`goPrev`／`goNext`／`goTo`／`removeQuestion` | `AnnotationPanel.test.tsx`、`QuestionPager.test.tsx`、`QuestionOverview.test.tsx` |

## 實作要點

1. **先改圖與對照表，再改名**（R8）。`TeacherDashboard` → `StudentManagePage`，要在同一次變更裡一起改 001／003／004 的組件圖、PNG 和 plan 對照表，否則架構測試會失敗。student-component 只是移除 `DevPanel`，那份圖沒有對應的自動化測試，靠人工確認。
2. **目前這一題用 key 記住，不記位置**（R5）。`currentKey` 存題目的 key，`currentIndex` 每次由 `doc.questions` 算出來。這樣上下移動時，目前這一題自然跟著移動（FR-018）。如果 `currentKey` 在 doc 裡找不到（例如清除全部、重新載入草稿、題目被刪掉），就回到第 1 題；沒有題目時為 `null`（FR-023）。
3. **刪除時先決定下一題，再呼叫 `onChange`**。刪除目前這一題時，下一題取原本位置 i 的後一題；如果刪的是最後一題，取新的最後一題（FR-017）。
4. **切題前先取消步驟**（FR-019）。`goTo`、`goPrev`、`goNext` 一律先 `setTarget(null)`、清掉提示訊息，再換 `currentKey`。`addQuestion` 例外：它本來就會把步驟設成新題目的題目格（FR-016）。
5. **「前往第 N 題」**（FR-020）。沒有進行中的步驟時，點到屬於其他題的格子，`selectedOwner` 會帶出那一題的 key，選取格資訊旁邊顯示「前往{title}」按鈕。
6. **題目總覽**（FR-022）。`overviewOf(doc, validation, currentKey)` 回傳 `QuestionOverviewItem[]`：
   - 某題有任何 `validation.issues` 的 `questionKey` 等於該題，`hasIssue` 就是 true。
   - 按鈕文字為題號；有錯時加上「⚠」與螢幕閱讀器文字「有錯誤」。
   - 目前這一題的按鈕加 `aria-current="true"`。
   - 用 `flex-wrap` 自動換行。
7. **抽屜無障礙**（R3）：
   - `SideMenu` 用 `role="dialog"`、`aria-modal="true"`、`aria-label="老師功能選單"`。
   - 打開時焦點移到第一個項目；Tab／Shift+Tab 只在選單項目間循環；按 Esc 或點遮罩就關閉，焦點回到三條線按鈕。
   - 選單項目用 `Link`，目前所在項目加 `aria-current="page"`。
   - 三條線按鈕帶 `aria-expanded`，`aria-label` 是「開啟選單」或「關閉選單」。
   - 切換路由後在 `useEffect` 裡關閉選單，避免用瀏覽器上一頁時選單殘留。
8. **目前所在項目的判斷**：路徑剛好是 `/teacher`，算搶答活動；路徑以 `/teacher/questions` 開頭，算題目管理；路徑以 `/teacher/students` 開頭，算學生管理（`isCurrentNav`）。
9. **頁面標題**：
   - `/teacher` 顯示「搶答活動」。
   - `StudentManagePage` 的標題改為「學生管理」。
   - 測試裡原本斷言標題「老師管理頁」的地方一併更新。
10. **既有測試的處理**：
    - `DevTeacherPanel.test.tsx` 隨畫面一起刪除。
    - `routeGuards.test.tsx` 裡「老師管理頁有題目管理按鈕」這類斷言，改成透過選單切換。
    - 後端用到 `/api/dev` 的整合測試不動（FR-013a）。

## Complexity Tracking

沒有違反憲章的項目。
