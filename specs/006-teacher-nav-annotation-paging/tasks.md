---

description: "老師端側邊選單導覽與題目標註逐題切換：任務清單"
---

# Tasks: 老師端側邊選單導覽與題目標註逐題切換

**Input**: Design documents from `/specs/006-teacher-nav-annotation-paging/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/ui-routes.md、quickstart.md

**Tests**: 憲章原則 IV 要求每個功能都有正常與邊界案例測試，因此每個故事都包含測試任務。先寫測試、確認測試失敗，再寫實作。

**Organization**: 依使用者故事分組。US1、US2、US3 為 P1，US4、US5 為 P2。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行處理（不同檔案、不依賴未完成的任務）
- **[Story]**：所屬的使用者故事（US1～US5）

## Path Conventions

Web app：`frontend/src/`、`frontend/tests/`、`backend/tests/`、`diagrams/`、`specs/`

---

## Phase 1: Setup（共用準備）

**Purpose**：確認基準狀態

- [X] T001 在 repo 根目錄執行 `npm test`、`npm run typecheck`、`npm run lint`，記錄目前的通過數作為基準。lint 或 prettier 已經失敗的既有檔案只記錄，不在本功能修。結果記在 `specs/006-teacher-nav-annotation-paging/quickstart.md` §4 的回報裡

---

## Phase 2: Foundational（改名與設計圖同步，會擋住所有故事）

**Purpose**：依 research R8，`TeacherDashboard` → `StudentManagePage` 的改名必須和 001／003／004 的設計圖、對照表、架構測試一起完成。US1 的「學生管理」選單項目與 US2 都需要新路由。

**⚠️ CRITICAL**：這個 phase 完成前，不要開始任何故事

- [X] T002 改 `diagrams/001-component.puml`、`diagrams/003-component.puml`、`diagrams/004-component.puml`：把組件 `老師管理頁\nTeacherDashboard` 換成 `學生管理頁\nStudentManagePage\n(006 由 TeacherDashboard 改名)`，再以 `java -jar plantuml.jar -charset UTF-8 "diagrams/00[134]-component.puml"` 重新產生 PNG（research R8、憲章 VI）
- [X] T003 改 `specs/001-foundation-auth-groups/plan.md`、`specs/003-sheets-question-import/plan.md`、`specs/004-activity-control-monitor/plan.md` 的「組件圖 → 檔案」表：把 `TeacherDashboard` 那一格改成 `StudentManagePage`，檔案改為 `frontend/src/pages/StudentManagePage.tsx`，並加註「006 改名」（research R8）
- [X] T004 用 `git mv frontend/src/pages/TeacherDashboard.tsx frontend/src/pages/StudentManagePage.tsx`，元件與匯出名稱改成 `StudentManagePage`。這一步只改名，內容在 US2 調整
- [X] T005 在 `frontend/src/main.tsx` 把 `TeacherDashboard` import 換成 `StudentManagePage`，新增路由 `/teacher/students`（`Guard role="TEACHER"`）；`/teacher` 暫時仍渲染 `StudentManagePage`，US1 再改。參考 contracts/ui-routes.md §1
- [X] T006 執行 `npm run test -w backend -- tests/architecture/diagram-consistency`，確認 T002～T005 改名後，001／003／004／005 的案例全數通過。006 要到 T047 才加入這個測試，這樣各階段結束時測試都能全部通過
- [X] T007 更新既有前端測試裡的 import 與元件名稱：`frontend/tests/routeGuards.test.tsx` 等引用 `TeacherDashboard` 的地方改為 `StudentManagePage`，然後執行 `npm run test -w frontend` 確認全部通過

**Checkpoint**：001／003／004 的架構測試案例通過，`/teacher/students` 可以開啟

---

## Phase 3: User Story 1 - 登入後直接進入搶答活動，用側邊選單切換功能（Priority: P1）🎯 MVP

**Goal**：`/teacher` 改為搶答活動；所有老師畫面都有三條線按鈕和左側抽屜選單（FR-001～FR-007）

**Independent Test**：老師登入後落在「搶答活動」；打開選單依序點三個項目，每次都進到正確畫面，選單也會收起

### Tests for User Story 1 ⚠️

- [X] T008 [P] [US1] 新增 `frontend/tests/SideMenu.test.tsx`，涵蓋：
  - `open=false` 時不渲染選單；`open=true` 時有 `role="dialog"`、`aria-modal`、`aria-label="老師功能選單"`。
  - 三個項目依序為搶答活動、題目管理、學生管理。
  - 只有目前項目有 `aria-current="page"`。
  - 打開時焦點在第一項；按 Esc、點遮罩、點項目都會呼叫 `onClose`。
  - 焦點循環：焦點在最後一項時按 Tab，回到第一項；焦點在第一項時按 Shift+Tab，到最後一項。焦點不會移到選單後面的頁面（contracts/ui-routes.md §2.2「焦點循環」）。
  - 依據 data-model.md §1 的 `TeacherNavItem.label`、`TeacherNavItem.path` 與 contracts/ui-routes.md §2.2。
- [X] T009 [P] [US1] 新增 `frontend/tests/TeacherLayout.test.tsx`，涵蓋：
  - 三條線按鈕的 `aria-label` 會在「開啟選單」與「關閉選單」間切換，`aria-expanded` 正確。
  - 點「學生管理」後路由變成 `/teacher/students`，選單收起。
  - 關閉後焦點回到按鈕；pathname 改變時選單關閉。
  - 依據 data-model.md §2 的 `menuOpen` 轉換。
- [X] T010 [P] [US1] 更新 `frontend/tests/routeGuards.test.tsx`，涵蓋：
  - 老師開 `/teacher` 時 h2 是「搶答活動」。
  - `/teacher/activity` 會導到 `/teacher`。
  - 學生開 `/teacher` 被拒（此功能僅限老師使用）。
  - 學生頁面 `/student` 沒有「開啟選單」按鈕。
  - 把原本「老師管理頁有題目管理按鈕」那類斷言改成透過選單切換到 `/teacher/questions`。
  - 在 `/teacher` 經選單切到 `/teacher/students` 再切回 `/teacher` 後，`ActivityControlPage` 會重新取得活動狀態：mock 的活動狀態查詢（`apiClient` 的 `getActivity`，即 GET `/teacher/activity`）被再次呼叫，畫面顯示第二次回應的狀態（spec Edge Cases「進行中的活動」）。
- [X] T011 [P] [US1] 更新 `frontend/tests/LoginPage.test.tsx`：老師登入後落在 `/teacher`，畫面是「搶答活動」（FR-001）

### Implementation for User Story 1

- [X] T012 [P] [US1] 新增 `frontend/src/components/teacherNav.ts`：匯出 `interface TeacherNavItem`，欄位依 data-model.md §1 的 `TeacherNavItem.label`、`TeacherNavItem.path`；匯出唯讀的 3 項 `TEACHER_NAV_ITEMS`；匯出 `isCurrentNav(item, pathname)`，判斷規則依 data-model.md §1 的表格
- [X] T013 [P] [US1] 在 `frontend/src/components/Layout.tsx` 加上選填的 `leading?: ReactNode`，渲染在頁首最左側、「課程搶答系統」之前。沒傳時外觀與現在完全相同（research R4、FR-007）
- [X] T014 [US1] 新增 `frontend/src/components/SideMenu.tsx`：匯出 `interface SideMenuProps`（`open`、`currentPath`、`items`、`onClose`，對應 006-class）與 `SideMenu`。抽屜寬 `min(80vw,18rem)`，有遮罩、Esc 關閉、焦點管理（含 Tab／Shift+Tab 在選單項目間循環）、`motion-reduce` 時不播動畫，項目最小高度 44px，用 `Link`。細節見 contracts/ui-routes.md §2.2 與 research R3（依賴 T012）
- [X] T015 [US1] 新增 `frontend/src/components/TeacherLayout.tsx`：匯出 `interface TeacherLayoutProps { title; children }` 與 `TeacherLayout`。內部持有 `menuOpen`，三條線按鈕當作 `leading` 傳給 `Layout`，並渲染 `SideMenu`。pathname 改變時關閉選單；關閉後焦點回到按鈕。依據 data-model.md §2 的 `menuOpen` 與 contracts §2.1（依賴 T013、T014）
- [X] T016 [US1] 在 `frontend/src/main.tsx` 讓 `/teacher` 渲染 `ActivityControlPage`，`/teacher/activity` 改為 `<Navigate to="/teacher" replace />`（research R2、contracts §1）
- [X] T017 [P] [US1] 在 `frontend/src/pages/ActivityControlPage.tsx`，兩處 `Layout title="搶答活動"` 都改用 `TeacherLayout`
- [X] T018 [P] [US1] 在 `frontend/src/pages/QuestionManagePage.tsx` 改用 `TeacherLayout`，並移除頁內的「學生帳號與組別管理」連結 `nav`（FR-011）
- [X] T019 [P] [US1] 在 `frontend/src/pages/StudentManagePage.tsx` 改用 `TeacherLayout`
- [X] T020 [P] [US1] 在 `frontend/src/activity/ActivityStartPanel.tsx`，「前往組別管理」的連結改指 `/teacher/students`（contracts §1）
- [X] T021 [US1] 執行 `npm run test -w frontend -- SideMenu TeacherLayout routeGuards LoginPage ActivityControlPage QuestionManagePage`，修到全部通過

**Checkpoint**：老師端可透過選單在三個畫面之間切換，`/teacher` 是搶答活動

---

## Phase 4: User Story 2 - 「學生管理」畫面（Priority: P1）

**Goal**：學生帳號與組別管理集中在 `/teacher/students`，兩個區塊互相連動（FR-008～FR-011）

**Independent Test**：從選單進入學生管理，建立學生並加入組別，兩邊清單都即時更新

### Tests for User Story 2 ⚠️

- [X] T022 [P] [US2] 新增 `frontend/tests/StudentManagePage.test.tsx`，涵蓋：
  - h2 為「學生管理」；依序渲染 `StudentCreatePanel`、`GroupManagePanel`。
  - 建立學生後，`GroupManagePanel` 會以新的 refreshKey 重新載入；組別變更後，學生清單也會重新載入（沿用舊 dashboard 測試的 mock 方式）。
  - 畫面上沒有「搶答活動」「題目管理」的按鈕連結（FR-011）。
- [X] T023 [P] [US2] 在 `frontend/tests/routeGuards.test.tsx` 加入：學生開 `/teacher/students` 會看到「此功能僅限老師使用」；未登入會被導到 `/login`（FR-010）

### Implementation for User Story 2

- [X] T024 [US2] 在 `frontend/src/pages/StudentManagePage.tsx`：標題改為「學生管理」，移除頁內「搶答活動」「題目管理」的 `nav` 連結，更新元件註解說明 006 改名，保留 `studentsVersion`、`groupsVersion` 的互相觸發（FR-008、FR-009、FR-011）
- [X] T025 [US2] 執行 `npm run test -w frontend -- StudentManagePage StudentCreatePanel GroupManagePanel routeGuards`，修到全部通過

**Checkpoint**：學生管理畫面功能與原本的老師管理頁相同

---

## Phase 5: User Story 3 - 題目標註一次只顯示一題（Priority: P1）

**Goal**：標註區只渲染目前這一題，可用上一題／下一題切換；新增、刪除、移動題目時，目前這一題都正確（FR-014～FR-021、FR-023、FR-024）

**Independent Test**：連續新增 10 題，標註區永遠只有 1 張編輯卡片，可以逐題切換並修改格位

### Tests for User Story 3 ⚠️

- [X] T026 [P] [US3] 新增 `frontend/tests/QuestionPager.test.tsx`，涵蓋：
  - 顯示「第 X 題／共 N 題」，並有 `aria-live="polite"`。
  - 在第一題時「上一題」停用，在最後一題時「下一題」停用；只有 1 題時兩個都停用。
  - 點擊時呼叫 `onPrev`、`onNext`。
  - 依據 data-model.md §3 衍生值表中的「可按上一題」「可按下一題」與位置提示。
- [X] T027 [US3] 擴充 `frontend/tests/AnnotationPanel.test.tsx`（以 hook 加面板一起渲染）。逐條依 data-model.md §3 的狀態轉換表，涵蓋：
  - 新增題目後切到新題，並進入題目格步驟。
  - 上一題、下一題。
  - 刪除目前這一題的三種分支：還有後一題、刪的是最後一題、刪完沒有題目。
  - 刪除其他題時，目前這一題不變。
  - 上移／下移後仍是同一題，位置提示更新。
  - 步驟進行中按「下一題」會取消步驟，之後點格子不會指定給任何題目。
  - `clearAll` 後顯示空狀態訊息。
  - 換一份 doc 時，回到第 1 題（`CurrentQuestion.currentKey` 的正規化）。
  - 不論幾題，`listitem` 編輯卡片都只有 1 個（SC-002 結構斷言）。
  - 選取其他題的格子時出現「前往第 N 題」，點了會切過去；步驟進行中點到其他題的格子，只顯示佔用訊息、不出現前往按鈕。
- [X] T028 [P] [US3] 擴充 `frontend/tests/SheetGrid.test.tsx`：`CellMark.current` 為 true 的角標有 `data-current="true"` 和外框樣式，其他角標沒有（data-model.md §5 `CellMark.current`、FR-021）
- [X] T029 [P] [US3] 擴充 `frontend/tests/QuestionManagePage.test.tsx`：在標註步驟新增 3 題後，格線同時顯示 3 題的角標，但只有目前這一題的角標是 `data-current="true"`；`useAnnotationDraft` 的自動儲存內容與改版前相同（FR-024）

### Implementation for User Story 3

- [X] T030 [P] [US3] 在 `frontend/src/questions/SheetGrid.tsx` 的 `interface CellMark` 加上 `current?: boolean`（data-model.md §5 `CellMark.current`）。`current` 的角標加 `ring-2`，提高 z-index，並輸出 `data-current="true"`（research R6）
- [X] T031 [US3] 在 `frontend/src/questions/AnnotationPanel.tsx` 的 `useAnnotationEditor`：
  - 新增內部狀態 `rawKey`。
  - 衍生出 `currentKey`、`currentIndex`，規則依 data-model.md §3 的 `CurrentQuestion.currentKey`、`CurrentQuestion.currentIndex`。
  - 新增 `goTo`、`goPrev`、`goNext`：先取消步驟並清除提示訊息，再切換；`goTo` 遇到不存在的 key 時不動作。
  - 修改 `addQuestion`（切到新題）、`removeQuestion`（依 data-model §3 選後一題，沒有就前一題，再沒有就 `null`，並取消指向該題的步驟）、`clearAll`（`null`）。
  - 在 `interface AnnotationEditor` 加入上述成員，名稱與 006-class 一致。
- [X] T032 [US3] 在 `frontend/src/questions/AnnotationPanel.tsx`：
  - `ownerOf()` 的回傳值多帶 `key`。
  - `marksFor(doc, currentKey?)` 替目前這一題的角標加 `current: true`。
  - 選取格資訊在沒有進行中步驟、且格子屬於其他題時，顯示「前往{title}」按鈕並呼叫 `editor.goTo`（FR-020、research R6）。
- [X] T033 [P] [US3] 新增 `frontend/src/questions/QuestionPager.tsx`：匯出 `QuestionPager({ index, total, onPrev, onNext })`，按鈕高度至少 44px，可自動換行。規則依 data-model.md §3 與 contracts/ui-routes.md §4 第 3 點
- [X] T034 [US3] 在 `frontend/src/questions/AnnotationPanel.tsx` 的 `AnnotationPanel`：
  - 把 `doc.questions.map` 改成只渲染 `doc.questions[editor.currentIndex]` 那一張卡片，卡片內容與現行相同。
  - 在步驟提示上方加 `QuestionPager`，題數大於等於 1 時才顯示。
  - 0 題時維持空狀態訊息。
  - 依據 contracts/ui-routes.md §4（依賴 T031、T032、T033）。
- [X] T035 [US3] 在 `frontend/src/pages/QuestionManagePage.tsx` 把 `marksFor(state.doc)` 改為 `marksFor(state.doc, editor.currentKey)`
- [X] T036 [US3] 執行 `npm run test -w frontend -- AnnotationPanel QuestionPager SheetGrid QuestionManagePage useAnnotationDraft`，修到全部通過

**Checkpoint**：標註頁的長度不再隨題數增加，可以逐題切換

---

## Phase 6: User Story 4 - 一眼看出哪些題目還有錯誤（Priority: P2）

**Goal**：題目總覽以「⚠」標出有錯誤的題目，點題號可跳題（FR-022）

**Independent Test**：6 題中第 2、5 題缺作答格，總覽只標這兩題，點題號可直接跳過去

### Tests for User Story 4 ⚠️

- [X] T037 [P] [US4] 新增 `frontend/tests/QuestionOverview.test.tsx`，涵蓋：
  - 每題一個按鈕，按鈕文字是題號。
  - `hasIssue` 的按鈕有「⚠」，`aria-label` 是「第 N 題，有錯誤」；其他題的 `aria-label` 是「第 N 題」。
  - 只有目前這一題有 `aria-current="true"`。
  - 點擊時呼叫 `onSelect(key)`。
  - 依據 data-model.md §4 的 `QuestionOverviewItem.title`、`QuestionOverviewItem.hasIssue`、`QuestionOverviewItem.current`。
- [X] T038 [US4] 擴充 `frontend/tests/AnnotationPanel.test.tsx`，涵蓋：
  - `overviewOf` 只把有 `issues` 的題目標成 `hasIssue`；只有 `warnings` 的題目不算。
  - 修正錯誤後，標示立即消失。
  - 在總覽點第 5 題，會切到第 5 題。

### Implementation for User Story 4

- [X] T039 [US4] 在 `frontend/src/questions/AnnotationPanel.tsx` 匯出 `interface QuestionOverviewItem`，以及純函式 `overviewOf(doc, validation, currentKey)`。欄位與規則依 data-model.md §4 的 `QuestionOverviewItem.key`、`.title`、`.hasIssue`、`.current`（research R7）
- [X] T040 [P] [US4] 新增 `frontend/src/questions/QuestionOverview.tsx`：匯出 `QuestionOverview({ items, onSelect })`，用 `flex-wrap` 排列題號按鈕，按鈕至少 44×44px，有錯時用「⚠」加文字，不只靠顏色（contracts/ui-routes.md §4 第 2 點）
- [X] T041 [US4] 在 `frontend/src/questions/AnnotationPanel.tsx`，標題列下方、`QuestionPager` 上方渲染 `QuestionOverview`（題數大於等於 1 時），`onSelect={editor.goTo}`（依賴 T039、T040）
- [X] T042 [US4] 執行 `npm run test -w frontend -- QuestionOverview AnnotationPanel`，修到全部通過

**Checkpoint**：不必逐題翻找，就能找到有錯誤的題目

---

## Phase 7: User Story 5 - 移除開發工具入口（Priority: P2）

**Goal**：老師端完全沒有「模擬老師搶答操作（開發工具）」，`/dev` 顯示 404；後端 `/api/dev` 保留（FR-012、FR-013、FR-013a）

**Independent Test**：在開發環境以老師登入，所有畫面與選單都找不到開發工具；開 `/dev` 看到「找不到這個頁面」

### Tests for User Story 5 ⚠️

- [X] T043 [P] [US5] 在 `frontend/tests/routeGuards.test.tsx` 加入：
  - 老師開 `/dev` 時顯示「找不到這個頁面」。
  - 開發模式下，`/teacher`、`/teacher/questions`、`/teacher/students` 與打開的選單裡，都找不到文字「模擬老師搶答操作」（FR-012、FR-013、SC-006）。

### Implementation for User Story 5

- [X] T044 [US5] 在 `frontend/src/main.tsx` 移除 `/dev` 路由與 `DevTeacherPanel` 的 import；刪除 `frontend/src/pages/DevTeacherPanel.tsx` 與 `frontend/tests/DevTeacherPanel.test.tsx`。如果 `api/client.ts` 有只給 DevTeacherPanel 用的程式碼，確認沒有其他地方引用後一併刪除
- [X] T045 [US5] 在 `frontend/src/pages/StudentManagePage.tsx` 移除 `import.meta.env.DEV` 的開發工具連結（FR-012）
- [X] T046 [US5] 確認後端沒有任何修改（FR-013a）。執行 `npm run test -w backend -- tests/integration/devTeacher tests/integration/reveal tests/integration/lateSubmit`，確認照常通過

**Checkpoint**：老師介面已經沒有開發工具

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**：設計圖一致性、窄螢幕、整體驗證

- [X] T047 在 `backend/tests/architecture/diagram-consistency.test.ts` 加入 `set006`：
  - 讀 `specs/006-teacher-nav-annotation-paging/plan.md`、`diagrams/006-component.puml`、`diagrams/006-class.puml`。
  - 呼叫 `describeDiagramSet('006', set006, 17, ['TeacherNavItem','TeacherLayoutProps','SideMenuProps','AnnotationEditor','QuestionOverviewItem','CellMark'])`。組件圖實際有 17 個組件。
  - 最後的檔案對照測試也納入 `set006`，標題改為「001＋003＋004＋005＋006」。
  - 執行 `npm run test -w backend -- tests/architecture/diagram-consistency`，確認 001／003／004／005／006 全數通過。不一致時，依憲章 VI 修正程式碼，或先更新 `diagrams/006-*.puml` 並重新產生 PNG，再同步 `specs/006-teacher-nav-annotation-paging/plan.md` 的對照表
- [X] T048 [P] 更新 `diagrams/student-component.puml`：移除 `DevPanel` 組件與它的連線，加註「006 移除前端開發工具，後端 /api/dev 保留」，以 `java -jar plantuml.jar -charset UTF-8 diagrams/student-component.puml` 重新產生 PNG（research R8）
- [X] T049 [P] 擴充 `frontend/tests/narrowScreen.test.tsx`：在 360px 寬度下渲染已打開的 `TeacherLayout` 選單，以及有 30 題的 `QuestionOverview`，斷言沒有會造成溢出的固定寬度 class，總覽使用 `flex-wrap`（SC-005）
- [X] T050 手動比對 `diagrams/006-sequence-navigation.puml`、`diagrams/006-sequence-annotation-paging.puml` 與實際的呼叫順序（憲章 VI 時序圖驗證），結果記在完成回報
- [X] T051 執行 `npm test`、`npm run typecheck`、`npm run lint`；只對本功能改過的檔案執行 `npx prettier --check`，必要時 `--write`
- [X] T052 依 `specs/006-teacher-nav-annotation-paging/quickstart.md` §3 走過手動驗證情境 1～7，記錄做到哪些、沒做到哪些（例如真實手機只用模擬器）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：沒有依賴
- **Foundational（Phase 2）**：依賴 Setup，會擋住所有故事。T002～T005 必須在同一次變更裡完成，架構測試才會一致
- **US1（Phase 3）**：依賴 Foundational
- **US2（Phase 4）**：依賴 Foundational。T019 與 T024 都改 `StudentManagePage.tsx`，建議在 US1 之後做
- **US3（Phase 5）**：依賴 Foundational，與 US1／US2 沒有共用檔案（T018 和 T035 都改 `QuestionManagePage.tsx`，要依序做）
- **US4（Phase 6）**：依賴 US3（需要 `currentKey`、`goTo`）
- **US5（Phase 7）**：依賴 Foundational；T045 改 `StudentManagePage.tsx`，排在 US2 之後
- **Polish（Phase 8）**：依賴所有要交付的故事

### User Story Dependencies

- US1 → 提供 `TeacherLayout`，US2 與 US5 在畫面上會用到，但測試各自獨立
- US3 → US4
- US2、US5 共用 `StudentManagePage.tsx`，要依序修改

### Within Each User Story

- 先寫測試並確認失敗，再寫實作
- 型別與純函式（`teacherNav.ts`、`overviewOf`）→ 元件 → 頁面整合 → 執行該故事的測試

### Parallel Opportunities

- T008～T011 可平行（不同測試檔）
- T012、T013 可平行；T017～T020 可平行（不同檔案）
- US3 的 T026、T028、T029 可平行；T030、T033 可平行
- US1 與 US3 可以由兩人同時進行，只有 `QuestionManagePage.tsx` 要協調（T018 先、T035 後）
- T048、T049 可平行

---

## Parallel Example: User Story 1

```bash
# 測試一起寫：
Task: "T008 新增 frontend/tests/SideMenu.test.tsx"
Task: "T009 新增 frontend/tests/TeacherLayout.test.tsx"
Task: "T010 更新 frontend/tests/routeGuards.test.tsx"
Task: "T011 更新 frontend/tests/LoginPage.test.tsx"

# 基礎元件一起做：
Task: "T012 新增 frontend/src/components/teacherNav.ts"
Task: "T013 Layout 加 leading 插槽 frontend/src/components/Layout.tsx"

# 頁面套用 TeacherLayout 一起做：
Task: "T017 ActivityControlPage.tsx"
Task: "T018 QuestionManagePage.tsx"
Task: "T019 StudentManagePage.tsx"
Task: "T020 ActivityStartPanel.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "T026 新增 frontend/tests/QuestionPager.test.tsx"
Task: "T028 擴充 frontend/tests/SheetGrid.test.tsx"
Task: "T029 擴充 frontend/tests/QuestionManagePage.test.tsx"
Task: "T030 SheetGrid.tsx 加 CellMark.current"
Task: "T033 新增 frontend/src/questions/QuestionPager.tsx"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational（改名與設計圖同步）
2. Phase 3 US1：選單導覽，`/teacher` 改為搶答活動
3. **停下來驗證**：老師可在三個畫面間切換
4. Phase 4 US2：學生管理畫面整理完成。到這裡，使用者描述的導覽部分已經完整

### Incremental Delivery

1. Foundational → US1 → US2：完成導覽改版
2. US3：解決標註頁過長的問題（使用者描述的第二個問題）
3. US4：補上錯誤總覽
4. US5：清掉開發工具
5. Polish：架構測試、窄螢幕、手動驗證

---

## Notes

- 只有在使用者要求時才 commit
- 不要修本功能沒動到的既有 prettier 問題
- 後端程式碼在本功能中不應有任何修改，架構測試除外
