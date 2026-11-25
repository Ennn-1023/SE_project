---

description: "Task list for 007 學生作答頁倒數計時與最後十秒變色提醒"
---

# Tasks: 學生作答頁倒數計時與最後十秒變色提醒

**Input**: Design documents from `/specs/007-answer-countdown-color/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/ui-countdown.md、quickstart.md

**Tests**: 憲章原則 IV 要求每個功能都有正常案例與邊界案例測試，因此每個故事都包含測試任務。先寫測試、確認失敗，再實作。

**Organization**: 依 spec 的兩個 P1 故事分組。US1 是「看得到倒數」（含捲動時固定），US2 是「最後十秒變橘色、與老師端一致」。兩者改的檔案大多不同，可以分開完成與驗收。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可平行（不同檔案，不依賴未完成的任務）
- **[Story]**：所屬故事（US1、US2）
- 本功能只動 `frontend/`，外加 `backend/tests/architecture/` 的架構測試

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**：確認基準，並加入兩個故事都會用到的版面 token

- [X] T001 在專案根目錄執行 `npm run test -w frontend`、`npm run test -w backend -- tests/architecture/diagram-consistency`，記錄修改前的通過數，作為回歸基準
- [X] T002 在 `frontend/src/styles/tokens.css` 新增 `--connection-banner-h: 2.5rem` 與 `--answering-head-h: 5rem`，值依 `data-model.md` §4（版面狀態）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：讓 `CountdownTimer` 的公開型別符合 007 類別圖，之後兩個故事的測試都會匯入它

**⚠️ CRITICAL**：完成前不要開始寫故事的測試

- [X] T003 在 `frontend/src/components/CountdownTimer.tsx` 把內部的 `interface Props` 改名並匯出為 `export interface CountdownTimerProps`，欄位（`endsAt`、`clockOffset`、`expiredText?`）與行為不變（`contracts/ui-countdown.md` §2）；執行 `npm run typecheck -w frontend` 確認沒有破壞 `AnsweringView`、`MonitorBoard`

**Checkpoint**：既有測試全數通過，可以開始兩個故事

---

## Phase 3: User Story 1 - 作答時看到依老師設定時間倒數的剩餘時間 (Priority: P1) 🎯 MVP

**Goal**：學生在作答頁一直看得到依 `endsAt` 倒數的剩餘時間。重新整理、送出後都照常顯示；捲動長題目時，題號＋倒數那一列固定在畫面頂端，不遮住作答欄位，也不和斷線提示列重疊（FR-001～004、009、011、012）

**Independent Test**：依 `quickstart.md` §3 第 2、4、5、6、7 步。老師以 60 秒開一題，學生重新整理後接續倒數；送出後倒數仍在；在 375px 下捲到底，倒數列仍固定在頂端；斷線時倒數列在提示列下方

### Tests for User Story 1 ⚠️

> 先寫、先確認失敗（T004 的 FR-011 斷言可能已經通過，屬於既有行為的回歸保護）

- [X] T004 [P] [US1] 擴充 `frontend/tests/AnsweringView.test.tsx`：
  - 本組已送出（`myTeamSubmission` 有值）時，`role="timer"` 仍存在，且位於 `.answering-head` 內（FR-011）。
  - 題組題（`kind: 'GROUP'`，3 個小題）時，`.answering-head` 是 `section.answering` 的第一個子元素（sticky 的前提）。
- [X] T005 [P] [US1] 擴充 `frontend/tests/style.test.tsx`，讀取 `frontend/src/styles/global.css` 原始碼並斷言（`contracts/ui-countdown.md` §3）：
  - `.answering-head` 含 `position: sticky`、`top: var(--answering-sticky-top, 0)`、`background: var(--color-surface)`。
  - `.answering-head` 的 `z-index` 數值小於 `.connection-banner` 的 `z-index`。
  - `.connection-banner` 含 `min-height: var(--connection-banner-h)`。
  - 存在規則 `.connection-banner ~ .page`，並設定 `--answering-sticky-top: var(--connection-banner-h)`。
  - `.answering textarea` 與 `.answering input` 含 `scroll-margin-top`，且使用 `--answering-head-h`。
- [X] T006 [P] [US1] 擴充 `frontend/tests/StudentPage.test.tsx`：連線狀態為 offline 且 phase 為 `ANSWERING` 時，`.connection-banner` 在 DOM 中是 `main.page` 之前的兄弟元素（research R6 的兄弟選擇器前提）

### Implementation for User Story 1

- [X] T007 [US1] 在 `frontend/src/styles/global.css` 的 `.answering-head` 加上 sticky：
  - `position: sticky`、`top: var(--answering-sticky-top, 0)`、`z-index: 5`、`background: var(--color-surface)`。
  - 負邊距 `calc(-1 * var(--space-4))`（上、左右）加上同量的 `padding: var(--space-4)`。
  - `border-radius: var(--radius-lg) var(--radius-lg) 0 0`。
  - 依 plan「實作要點 4」。保留原本的 flex 排版宣告。
- [X] T008 [US1] 在 `frontend/src/styles/global.css` 調整斷線提示列（plan「實作要點 5」）：
  - `.connection-banner` 加上 `min-height: var(--connection-banner-h)`、`box-sizing: border-box`、`display: flex`、`align-items: center`、`justify-content: center`。
  - 新增規則 `.connection-banner ~ .page { --answering-sticky-top: var(--connection-banner-h); }`。
  - 不改 `frontend/src/pages/StudentPage.tsx` 的 DOM 順序。
- [X] T009 [US1] 在 `frontend/src/styles/global.css` 新增 `.answering textarea, .answering input { scroll-margin-top: calc(var(--answering-sticky-top, 0px) + var(--answering-head-h)); }`（plan「實作要點 6」，FR-012「不遮住作答欄位」）
- [X] T010 [US1] 執行 `npm run test -w frontend -- AnsweringView style StudentPage useServerCountdown`，確認 T004～T006 通過，且既有倒數測試沒有退化
- [X] T011 [US1] 啟動 `npm run dev`，依 `quickstart.md` §3 第 6、7 步手動驗證：
  - 375×667 與 1280×800 下，捲到底時倒數列固定在頂端，而且不透出下方文字。
  - 點最下方的作答欄位，欄位不被遮住。
  - 短題目的外觀與修改前相同。
  - 斷線時倒數列停在提示列下方。

  若負邊距造成短題目外觀改變，回頭調整 T007。

**Checkpoint**：US1 可以獨立驗收（倒數顯示＋捲動固定）

---

## Phase 4: User Story 2 - 平常為深藍色，最後十秒變成與老師端相同的橘色 (Priority: P1)

**Goal**：變色規則抽成 `countdownPhase()`，門檻 `URGENT_SEC = 10` 只定義一次。剩餘超過 10 秒為深藍，10 秒以內為與老師端相同的橘，歸零後顯示等待文字。學生頁與老師看板輸出相同的 `data-phase`（FR-005～010）

**Independent Test**：依 `quickstart.md` §3 第 1、2、3、8 步。老師以 15 秒開一題，學生頁在 `00:11` 時是深藍、`00:10` 時變橘，與老師看板同一秒變色；載入時剩 3 秒直接是橘色；5 秒的題目整段是橘色

### Tests for User Story 2 ⚠️

> 先寫、先確認失敗

- [X] T012 [P] [US2] 新增 `frontend/tests/countdownPhase.test.ts`：
  - 以 `it.each` 覆蓋 `contracts/ui-countdown.md` §1 的 6 列輸入／輸出表，輸入欄位依 `data-model.md` 的 `Countdown.remainingMs`、`Countdown.remainingSec`、`Countdown.expired`。
  - 另外斷言 `URGENT_SEC === 10`。
  - 重點邊界：10.4 秒（`remainingSec` 為 11）回傳 `normal`；`remainingMs: null` 回傳 `normal`（`data-model.md` §3 的判斷順序）。
- [X] T013 [P] [US2] 新增 `frontend/tests/CountdownTimer.test.tsx`，使用 `vi.useFakeTimers()`，並以 `vi.setSystemTime` 固定時間：
  - (a) `endsAt` 為 15 秒後：外層 `.countdown` 的 `data-phase` 是 `normal`，沒有 `countdown-urgent`；推進 4 秒（顯示 `00:11`）仍是 `normal`；再推進 1 秒（顯示 `00:10`）變成 `urgent`，並加上 `countdown-urgent`。
  - (b) 一開始只剩 3 秒：第一次 render 就是 `urgent`（FR-010）。
  - (c) `endsAt` 為 5 秒後：一開始就是 `urgent`。
  - (d) 推進到歸零：`data-phase` 是 `expired`，沒有 `countdown-urgent`，`role="timer"` 顯示「時間到，等待結果」（FR-009、research R4）。
  - (e) 傳入 `expiredText="時間到，結算中"` 時，歸零後顯示該文字。
- [X] T014 [P] [US2] 擴充 `frontend/tests/MonitorBoard.test.tsx`：
  - 以剩 8 秒的 `endsAt` 渲染老師看板，`.countdown` 的 `data-phase` 是 `urgent`。
  - 在同一個測試裡，以相同的 `endsAt` 與 `clockOffset` 渲染學生的 `AnsweringView`，斷言兩者的 `data-phase` 相同（FR-008、SC-003）。
  - 剩 30 秒時，兩者都是 `normal`。
- [X] T015 [US2] 擴充 `frontend/tests/style.test.tsx`（與 T005 同一檔，因此不加 [P]），斷言 `contracts/ui-countdown.md` §3 的顏色合約：
  - `.countdown-value` 使用 `color: var(--color-primary)`。
  - `.countdown-urgent .countdown-value` 使用 `color: var(--color-accent)`。
  - `tokens.css` 與 `theme.css` 的 `--color-primary` 都是 `#1f3a93`，`--color-accent` 都是 `#ff6b4a`（FR-007：不另訂新色）。

### Implementation for User Story 2

- [X] T016 [US2] 新增 `frontend/src/components/countdownPhase.ts`，匯出：
  - `export const URGENT_SEC = 10`；
  - `export type CountdownPhase = 'normal' | 'urgent' | 'expired'`；
  - `export function countdownPhase(c: Countdown): CountdownPhase`。

  判斷順序依 `data-model.md` §3（`Countdown.expired` → `Countdown.remainingMs === null` → `Countdown.remainingSec <= URGENT_SEC`）。`Countdown` 型別從 `../hooks/useServerCountdown` 匯入。檔頭註解說明「學生作答頁與老師看板共用，門檻只在這裡定義（FR-008）」。
- [X] T017 [US2] 修改 `frontend/src/components/CountdownTimer.tsx`：
  - 刪掉本地的 `URGENT_SEC` 與 `urgent` 計算，改成 `const phase = countdownPhase(countdown)`。
  - 外層 `div` 加上 `data-phase={phase}`，`phase === 'urgent'` 時才加 `countdown-urgent`。
  - 其餘 DOM（`countdown-label`、`role="timer"`、`aria-live="off"`）不變（`contracts/ui-countdown.md` §2，research R8）。
- [X] T018 [US2] 執行 `npm run test -w frontend -- countdownPhase CountdownTimer MonitorBoard AnsweringView style`，確認 T012～T015 通過，`MonitorBoard` 既有斷言沒有退化
- [X] T019 [US2] 啟動 `npm run dev`，依 `quickstart.md` §3 第 1、2、3、8 步手動驗證，並記錄結果：
  - 15 秒的題目重複 10 次，記錄 `00:11`／`00:10` 的顏色（SC-001）。
  - 學生頁與老師看板同一秒變色。
  - 重新整理後顏色正確。
  - 5 秒的題目整段是橘色。
  - 老師看板外觀不變。

**Checkpoint**：US1＋US2 都可以獨立驗收

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**：設計圖一致性（憲章 VI）、文件、整體驗證

- [X] T020 在 `backend/tests/architecture/diagram-consistency.test.ts` 加入 `set007`：
  - 讀 `specs/007-answer-countdown-color/plan.md`、`diagrams/007-component.puml`、`diagrams/007-class.puml`。
  - 呼叫 `describeDiagramSet('007', set007, 11, ['StudentView','AnsweringView','MonitorBoard','CountdownTimerProps','CountdownTimer','Countdown','useServerCountdown','CountdownPhase','countdownPhase'])`。
  - 最後的檔案對照測試也納入 `set007`，標題改為「001＋003＋004＋005＋006＋007」。
  - 檔頭註解加上 007。
  - 執行 `npm run test -w backend -- tests/architecture/diagram-consistency`，確認全數通過。不一致時，依憲章 VI 修正程式碼，或先更新 `diagrams/007-*.puml` 並以 `java -jar tools/plantuml.jar "./diagrams/007-*.puml"` 重新產生 PNG，再同步 `specs/007-answer-countdown-color/plan.md` 的對照表。
- [X] T021 手動比對 `diagrams/007-sequence-countdown.puml` 與實際的呼叫順序：`useStudentState` → `AnsweringView` → `CountdownTimer` → `useServerCountdown`＋`countdownPhase`，三個分支（深藍、橘、等待文字）都要對上（憲章 VI 時序圖驗證）。結果記在完成回報。
- [X] T022 [P] 在 `roadmap.md` 的「F7. 學生搶答作答」加一條：作答頁倒數以伺服器 `endsAt` 為準，剩 10 秒內改用與老師看板相同的橘色，捲動時題號＋倒數列固定在頂端（007）
- [X] T023 執行 `npm test`、`npm run typecheck`、`npm run lint`；只對本功能改過的檔案執行 `npx prettier --check`，必要時 `--write`
- [X] T024 依 `quickstart.md` §3 走過手動驗證情境 1～8，依 §4 的格式回報：
  - 指令與實際輸出摘要（shared、backend、frontend 各自的通過數）。
  - 375px 截圖。
  - 有沒做到的項目（例如只用瀏覽器模擬、沒用真實手機）要如實寫出。

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup（Phase 1）**：沒有依賴
- **Foundational（Phase 2）**：依賴 Setup；T003 會擋住兩個故事的測試，因為 T013、T014 會用到匯出的型別
- **US1（Phase 3）**：依賴 Foundational
- **US2（Phase 4）**：依賴 Foundational，不依賴 US1。唯一的共用檔是 `frontend/tests/style.test.tsx`（T005 與 T015），同時進行時要依序修改
- **Polish（Phase 5）**：T020 依賴 T003 與 T016（`CountdownTimerProps`、`countdownPhase.ts` 要存在）；T023、T024 依賴所有故事完成

### User Story Dependencies

- **US1（P1）**：只改 CSS 與測試，不依賴 US2
- **US2（P1）**：只改 `countdownPhase.ts`、`CountdownTimer.tsx` 與測試，不依賴 US1

### Within Each User Story

- 測試先寫並確認失敗，再實作
- US1：T007 → T008 → T009 都改 `global.css`，依序進行；T010 測試；T011 手動驗證
- US2：T016 → T017（T017 匯入 T016）；T018 測試；T019 手動驗證

### Parallel Opportunities

- T004、T005、T006 改不同的測試檔，可以平行
- T012、T013、T014 改不同的測試檔，可以平行
- 在 Foundational 完成後，US1（CSS）與 US2（TS 元件）可以由兩個人同時進行，只需注意 `style.test.tsx`
- T022（roadmap）可以與 T020、T021 平行

---

## Parallel Example: User Story 1

```bash
# 同時寫 US1 的三個測試：
Task: "AnsweringView.test.tsx：送出後倒數仍在 .answering-head"
Task: "style.test.tsx：sticky、提示列偏移、scroll-margin-top"
Task: "StudentPage.test.tsx：提示列是 main.page 之前的兄弟元素"
```

## Parallel Example: User Story 2

```bash
# 同時寫 US2 的三個測試：
Task: "countdownPhase.test.ts：合約表 6 列＋URGENT_SEC"
Task: "CountdownTimer.test.tsx：15 秒倒數 normal→urgent→expired、3 秒、5 秒"
Task: "MonitorBoard.test.tsx：老師看板與學生頁 data-phase 相同"
```

---

## Implementation Strategy

### MVP First（User Story 1）

1. Phase 1 Setup：T001、T002
2. Phase 2 Foundational：T003
3. Phase 3 US1：T004～T011
4. **STOP and VALIDATE**：手動驗證第 6、7 步。此時倒數已固定在頂端，變色沿用既有的 10 秒行為

### Incremental Delivery

1. Setup＋Foundational → 基準確立
2. US1 → 捲動固定可以示範
3. US2 → 變色規則有正式的純函式與兩端一致性測試
4. Polish → 架構測試、文件、完整回報

---

## Notes

- 本功能不改後端、API、socket 事件與資料格式；老師看板的外觀必須維持不變
- `URGENT_SEC` 只能在 `frontend/src/components/countdownPhase.ts` 定義一次
- 每完成一個任務或一組相關任務就 commit；commit 前檢查 diff，確認沒有機敏資料（憲章「安全與資料處理要求」）
- 測試資料一律使用虛構的題目與組別

## 實作紀錄（2026-11-25）

- **T011／T019／T024 手動驗證方式**：老師與學生帳號的密碼只存在本機 `.env`，因此沒有用真實帳號登入走完整流程。改用一個暫時的本機驗證頁（以假資料渲染真正的 `ConnectionBanner`＋`AnsweringView`＋全站樣式，驗證後已刪除），在瀏覽器中確認：
  - 375×667：捲到底時倒數列固定在頂端（top=0），沒有水平捲軸。
  - `00:11` 為深藍 `rgb(31, 58, 147)`，`00:10` 起為橘 `rgb(255, 107, 74)`。
  - 載入時剩 3 秒，直接是 urgent；歸零後顯示「時間到，等待結果」，階段為 expired。
  - 斷線時提示列在 0～40px，倒數列從 40px 開始，兩者不重疊；聚焦最下方的作答欄位時，欄位不被倒數列遮住。
  - 1280×800：長題目的倒數列同樣固定，寬度與卡片一致；短題目的外觀正常。
- **未在真實流程中驗證的項目**：老師看板與學生頁「同一秒變色」只由 `MonitorBoard.test.tsx` 自動測試保證，沒有開兩個真實視窗比對；SC-005 的學生問卷沒有做。
- **實作中發現並修正**：`html`／`body` 的 `overflow-x: hidden` 會讓 sticky 失效，已改為 `overflow-x: clip`，並加上回歸測試（research R5、contracts §3）。
- **時序圖比對（T021）**：`useStudentState` → `StudentPage` → `AnsweringView` → `CountdownTimer` → `useServerCountdown`＋`countdownPhase`，以及深藍／橘／等待文字三個分支，與 `diagrams/007-sequence-countdown.puml` 一致。
- **Prettier**：`AnsweringView.test.tsx`、`MonitorBoard.test.tsx`、`StudentPage.test.tsx` 在修改前就不符合 prettier，這次只整理本功能新增的段落，沒有重排整個檔案。
