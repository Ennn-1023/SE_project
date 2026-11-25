# Implementation Plan: 學生作答頁倒數計時與最後十秒變色提醒

**Branch**: `007-answer-countdown-color` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-answer-countdown-color/spec.md`

## Summary

學生作答頁原本就有依伺服器 `endsAt` 倒數的 `CountdownTimer`（002），而且和老師看板（004）共用同一個元件。本功能只改前端，做三件事：

1. **變色規則抽成純函式**
   - 新增 `countdownPhase.ts`，匯出 `URGENT_SEC = 10`、`CountdownPhase`、`countdownPhase()`。
   - `CountdownTimer` 改用這個函式，並輸出 `data-phase`。
   - 剩餘超過 10 秒時為深藍（`--color-primary`），10 秒以內為與老師端相同的橘（`--color-accent`）。門檻只定義一次，兩端不可能分開（FR-005～008）。
2. **倒數列捲動時固定在頂端**
   - `AnsweringView` 的 `.answering-head`（題號＋倒數）改為 CSS sticky，並加上不透明背景。
   - 斷線提示列出現時，倒數列改停在提示列下方。
   - 作答欄位加上 `scroll-margin-top`，避免被倒數列蓋住（FR-012）。
3. **補齊測試**：補上邊界測試與兩端一致性測試（FR-009～011），並把 007 加入設計圖一致性測試。

**不改**：後端、API、socket 事件、資料格式、老師看板的外觀。架構依 `./diagrams/007-*.puml`（憲章原則 VI），各項決策見 [research.md](research.md)。

## Technical Context

**Language/Version**：TypeScript 6（`strict: true`），沿用。

**Primary Dependencies**：沿用 React 19、Tailwind v4 與 `global.css`（cascade layer `components`）。**不新增套件**。

**Storage**：不需要。倒數階段完全由 `endsAt` 與目前時間推導（[data-model.md](data-model.md)）。

**Testing**：
- 前端：Vitest＋Testing Library（fake timers）。
- 樣式：讀取 CSS 原始碼做斷言，因為 jsdom 不能排版。
- 架構測試 `backend/tests/architecture/diagram-consistency.test.ts` 擴充到 007。

**Target Platform**：近兩年主流的手機、平板、桌機瀏覽器，最窄 320px，驗收寬度 375px（SC-004）。

**Project Type**：Web application（frontend＋backend＋shared），本功能只動 frontend。

**Performance Goals**：
- 倒數維持每 250 ms 重算，畫面每秒至少更新一次，誤差不超過 1 秒（FR-004）。
- 固定倒數列只用 CSS，不監聽捲動事件。

**Constraints**：
- 老師看板的外觀與行為不變。
- 門檻與顏色只在一個地方定義（FR-008）。
- 固定列不可遮住作答欄位（FR-012）。
- 題目短、不需要捲動時，外觀與修改前相同。

**Scale/Scope**：
- 新增 1 個模組 `countdownPhase.ts`。
- 修改 `CountdownTimer.tsx`（`Props` 改名並匯出為 `CountdownTimerProps`，加上 `data-phase`）、`global.css`、`tokens.css`。
- `AnsweringView.tsx` 結構不變，只靠 CSS 固定。
- 新增 2 個測試檔，擴充 4 個既有測試檔。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 檢查項目 | Phase 0 前 | Phase 1 後 | 依據 |
|------|----------|-----------|-----------|------|
| I. 輸入驗證 | 沒有新的外部輸入。作答秒數（5～600）仍由既有的 `shared/src/activity.ts` 在前後端驗證；`endsAt` 由伺服器產生，前端只負責顯示。`countdownPhase` 對 `remainingMs === null` 有明確的處理 | ✅ | ✅ [ui-countdown.md §1](contracts/ui-countdown.md) | R1、R3 |
| II. 清楚錯誤訊息 | 沒有新的錯誤情境。斷線沿用 002 的「連線中斷，正在重新連線，請稍後再送出」，歸零沿用「時間到，等待結果」 | ✅ | ✅ | R4、R6 |
| III. 機敏資料只放環境變數 | 不新增任何設定或機敏資料 | ✅ 無新增 | ✅ | — |
| IV. 正常＋邊界案例測試 | 正常案例：15 秒倒數由深藍轉為橘。邊界案例：11／10／1／0 秒、10.4 秒、沒有 `endsAt`、載入時剩 3 秒、5 秒的題目、送出後、斷線時的偏移。輸入驗證的測試由既有的作答秒數測試涵蓋 | ✅ | ✅ [quickstart.md §2](quickstart.md) | R7 |
| V. 回報測試指令與結果 | `npm test`、`npm run typecheck`、`npm run lint`，以及手動驗證第 1～8 步 | ✅ | ✅ quickstart §1、§4 | — |
| VI. PlantUML 設計優先 | specify 階段已產生 3 張圖。plan 階段為了讓架構測試能逐項對照，把類別圖改成匯出符號的形式（`CountdownTimerProps`、`Countdown`、`countdownPhase`、`CountdownPhase`），組件圖補上 `StudentPage`、`ConnectionBanner` 與後端識別名，並重新產生 PNG | ✅ 3 張圖＋PNG | ✅ 下方對照表；架構測試加入 007 | R2、R6 |

**Gate 結果**：全部通過，不需要填 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/007-answer-countdown-color/
├── plan.md              # 本檔
├── research.md          # Phase 0
├── data-model.md        # Phase 1：CountdownPhase 與版面 token
├── quickstart.md        # Phase 1：測試指令與手動驗證
├── contracts/
│   └── ui-countdown.md  # Phase 1：countdownPhase、CountdownTimer、樣式合約
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2（/speckit-tasks 產生）
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── countdownPhase.ts        # 新增：URGENT_SEC、CountdownPhase、countdownPhase()
│   │   ├── CountdownTimer.tsx       # 修改：改用 countdownPhase，匯出 CountdownTimerProps，輸出 data-phase
│   │   ├── AnsweringView.tsx        # 不改結構（.answering-head 由 CSS 固定）
│   │   └── ConnectionBanner.tsx     # 不改
│   ├── hooks/useServerCountdown.ts  # 不改
│   ├── activity/MonitorBoard.tsx    # 不改（共用 CountdownTimer）
│   └── styles/
│       ├── tokens.css               # 新增 --connection-banner-h、--answering-head-h
│       └── global.css               # .answering-head sticky、提示列固定高度與偏移、scroll-margin-top
└── tests/
    ├── countdownPhase.test.ts       # 新增
    ├── CountdownTimer.test.tsx      # 新增
    ├── AnsweringView.test.tsx       # 擴充：送出後倒數仍在
    ├── MonitorBoard.test.tsx        # 擴充：與學生頁的 data-phase 相同
    └── style.test.tsx               # 擴充：sticky／偏移／scroll-margin／顏色 token

backend/tests/architecture/diagram-consistency.test.ts   # 擴充：加入 007
diagrams/007-component.puml、007-class.puml、007-sequence-countdown.puml（＋PNG）
```

**Structure Decision**：沿用 002 的前端結構，新模組放在 `components/` 和 `CountdownTimer` 同層。後端不動。

## 設計圖對照表（憲章原則 VI）

### 組件圖 → 檔案（[007-component.puml](../../diagrams/007-component.puml)）

| 組件 | 檔案 | 組件 | 檔案 |
|------|------|------|------|
| AnsweringView | `frontend/src/components/AnsweringView.tsx` | 學生狀態 | `frontend/src/hooks/useStudentState.ts` |
| StudentPage | `frontend/src/pages/StudentPage.tsx` | ConnectionBanner | `frontend/src/components/ConnectionBanner.tsx` |
| MonitorBoard | `frontend/src/activity/MonitorBoard.tsx` | CountdownTimer | `frontend/src/components/CountdownTimer.tsx` |
| 倒數計算 | `frontend/src/hooks/useServerCountdown.ts` | 倒數色彩階段 | `frontend/src/components/countdownPhase.ts` |
| 樣式 | `frontend/src/styles/global.css`、`frontend/src/styles/theme.css`、`frontend/src/styles/tokens.css` | ActivityService | `backend/src/services/activityService.ts` |
| SocketServer | `backend/src/realtime/socketServer.ts` | | |

「學生狀態」是 `useStudentState`；「倒數計算」是 `useServerCountdown`；「倒數色彩階段」是 `countdownPhase()`。

### 類別圖 → 程式型別（[007-class.puml](../../diagrams/007-class.puml)）

| 類別圖元素 | 程式位置 |
|-----------|----------|
| `StudentView` | `shared/src/types.ts`（002，不改） |
| `AnsweringView` | `frontend/src/components/AnsweringView.tsx` |
| `MonitorBoard` | `frontend/src/activity/MonitorBoard.tsx`（004，不改） |
| `CountdownTimer`、`CountdownTimerProps` | `frontend/src/components/CountdownTimer.tsx` |
| `Countdown`、`useServerCountdown` | `frontend/src/hooks/useServerCountdown.ts`（002，不改） |
| `CountdownPhase`、`countdownPhase` | `frontend/src/components/countdownPhase.ts`（同檔匯出 `URGENT_SEC`） |

### 基礎設施檔案允許清單

| 檔案 | 角色 |
|------|------|
| `frontend/src/styles/tokens.css` | 新增版面 token（不在後端目錄，列出供人工對照） |

本功能不新增後端檔案，因此後端 routes／services／db 的允許清單沒有變動。

### 時序圖 → 程式流程

| 時序圖 | 程式流程 | 主要測試 |
|--------|----------|----------|
| [007-sequence-countdown](../../diagrams/007-sequence-countdown.puml)：開始搶答 → 推播 `endsAt` → 每 250 ms 計算剩餘時間 → 階段判斷 → 深藍／橘／等待文字 → 自動結束 | `ActivityService` → `SocketServer` → `useStudentState` → `AnsweringView` → `CountdownTimer` → `useServerCountdown`＋`countdownPhase` | `CountdownTimer.test.tsx`、`countdownPhase.test.ts`、`useServerCountdown.test.ts`、`StudentPage.test.tsx` |

## 實作要點

1. **先做純函式，再接元件**（R2、R3）。`countdownPhase` 依序判斷：`expired` → `remainingMs === null` → `remainingSec <= URGENT_SEC`。判斷以 `remainingSec`（顯示的秒數）為準，`CountdownTimer` 刪掉自己的 `URGENT_SEC` 常數，改從 `countdownPhase.ts` 匯入。
2. **保留既有 class**。`urgent` 時仍加 `countdown-urgent`，`expired` 時不加（R4），這樣老師看板的外觀不會變。外層 `div` 加 `data-phase={phase}`，供測試與樣式使用。
3. **`Props` 改名並匯出為 `CountdownTimerProps`**，欄位不變，讓類別圖可以對照。
4. **sticky 倒數列**（R5）：

   ```css
   .answering-head {
     position: sticky;
     top: var(--answering-sticky-top, 0);
     z-index: 5;
     background: var(--color-surface);
     margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-4)) 0;
     padding: var(--space-4);
     border-radius: var(--radius-lg) var(--radius-lg) 0 0;
   }
   ```

   負邊距要與 `.card` 的 padding 相同，讓背景蓋滿卡片寬度。實作時用手動驗證第 6 步確認，題目短時外觀與原本相同。
5. **斷線提示列**（R6）：
   - `.connection-banner` 設為 `min-height: var(--connection-banner-h)`，`box-sizing: border-box`，並用 flex 置中。
   - 新增 `.connection-banner ~ .page { --answering-sticky-top: var(--connection-banner-h); }`。
   - `StudentPage` 的 DOM 順序（提示列在前、`main.page` 在後）不能改，兄弟選擇器才會生效。
6. **作答欄位**：`.answering textarea, .answering input { scroll-margin-top: calc(var(--answering-sticky-top, 0px) + var(--answering-head-h)); }`。
7. **擴充架構測試**：
   - 在 `diagram-consistency.test.ts` 加入 `set007`，最少 11 個組件，類別包括 `CountdownTimerProps`、`Countdown`、`CountdownPhase`、`countdownPhase`、`useServerCountdown`、`CountdownTimer`。
   - 「程式檔案 ↔ 對照表」的合併清單也要加入 007。
   - 更新檔頭註解，加上 007。
8. **既有測試**：
   - `AnsweringView.test.tsx` 的倒數斷言不受影響。
   - `MonitorBoard.test.tsx` 若有斷言 `countdown-urgent`，結果應維持不變；新增的斷言只檢查 `data-phase`。

## Complexity Tracking

沒有違反憲章的項目。
