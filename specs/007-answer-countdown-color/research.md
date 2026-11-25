# Research：學生作答頁倒數計時與最後十秒變色提醒

Phase 0 的研究結果。Technical Context 沒有未定項目；以下記錄每個設計決定、理由與被排除的做法。

## R1：先盤點現況，再決定改什麼

- **Decision**：沿用 002 的倒數架構（`useServerCountdown` 依伺服器 `endsAt` 與 `clockOffset` 計算，每 250 ms 更新），**不改後端**。前端只做三件事：把「變色規則」抽成純函式、補上捲動時固定的倒數列、補上缺少的測試。
- **Rationale**：盤點結果如下表，大部分規格已經做到，缺的是固定倒數列（FR-012）、門檻與兩端一致的明確保證（FR-008），以及邊界測試。

  | 規格 | 現況 | 本功能要做的事 |
  |------|------|----------------|
  | FR-001～004（依 `endsAt` 倒數、mm:ss、無條件進位、每秒更新） | 已有（`useServerCountdown` 及其測試） | 不改 |
  | FR-005、006（>10 深藍、≤10 橘） | `CountdownTimer` 裡的 `URGENT_SEC = 10` 加上 `.countdown-urgent` | 抽出 `countdownPhase()`，補上 11／10 秒的邊界測試 |
  | FR-007、008（與老師端同色同門檻） | 兩端共用 `CountdownTimer`，但沒有測試保證 | 門檻只定義一次（`URGENT_SEC`），加測試確認老師看板與學生頁輸出相同的階段 |
  | FR-009（歸零後顯示等待文字） | 已有 | 補上「歸零後階段為 `expired`」的測試 |
  | FR-010（一載入就 ≤10 秒時直接顯示橘色） | 第一次 render 就用 `compute()` 算出狀態，已符合 | 補測試 |
  | FR-011（送出後倒數照常） | 已有（倒數在 `answering-head`，不受送出狀態影響） | 補測試 |
  | FR-012（捲動時倒數列固定在頂端） | 沒有 | 新增 |
- **Alternatives considered**：另外做一個學生專用的倒數元件。這樣兩端的顏色和門檻會分成兩份，違反 FR-008，因此不採用。

## R2：變色規則放在哪裡

- **Decision**：新增 `frontend/src/components/countdownPhase.ts`，匯出：
  - `URGENT_SEC = 10`；
  - `type CountdownPhase = 'normal' | 'urgent' | 'expired'`；
  - `countdownPhase(c: Countdown): CountdownPhase`。

  `CountdownTimer` 改用這個函式，在數字外層輸出 `data-phase`，並在 `urgent` 時保留既有的 `countdown-urgent` class。
- **Rationale**：純函式不需要計時器就能寫邊界測試（11→normal、10→urgent、1→urgent、歸零→expired）。門檻只在一個地方定義，老師端和學生端不可能分開。保留既有 class，老師看板的外觀就完全不會變（spec Assumptions）。
- **Alternatives considered**：
  - 在 `CountdownTimer` 加上 `urgentThresholdSec` prop：門檻變成可以各自設定，反而讓兩端有機會不一致。
  - 直接在 JSX 裡比較：沒辦法獨立測試邊界。

## R3：變色以「顯示的秒數」為準

- **Decision**：`countdownPhase` 依 `remainingSec`（無條件進位後的顯示秒數）判斷。`expired` 為真時回傳 `expired`；`remainingMs === null`（沒有 `endsAt`）時回傳 `normal`；`remainingSec <= URGENT_SEC` 時回傳 `urgent`；其餘回傳 `normal`。
- **Rationale**：spec 的邊界情況要求「數字與顏色一致」。如果剩 10.4 秒，畫面顯示 `00:11`，這時必須還是深藍色。
- **Alternatives considered**：用 `remainingMs <= 10_000` 判斷，會在顯示 `00:11` 的那一瞬間就變成橘色。

## R4：歸零後等待文字的顏色

- **Decision**：維持現況。`expired` 階段不加 `countdown-urgent`，等待文字沿用 `.countdown-value` 的主色，和老師看板「時間到，結算中」的呈現一致。
- **Rationale**：spec 的邊界情況要求「與老師端看板歸零後的呈現方式一致」，而老師端不在本功能的修改範圍內。
- **Alternatives considered**：歸零後也顯示橘色。這會改到老師看板，違反「老師端不修改」。

## R5：捲動時固定倒數列的做法（FR-012）

- **Decision**：`.answering-head`（題號＋倒數）改為 `position: sticky; top: var(--answering-sticky-top, 0)`，並加上：
  - **背景**：`var(--color-surface)`，與卡片同色，捲動時蓋住下方內容；用負邊距加上同量的 padding，延伸到卡片內距，避免透出文字。
  - **`z-index: 5`**：低於斷線提示列的 10。
  - **作答欄位**：`.answering textarea, .answering input` 加上 `scroll-margin-top: var(--answering-head-h, 5rem)`。手機鍵盤彈出、瀏覽器把聚焦的欄位捲進畫面時，欄位會停在倒數列下方，不會被蓋住。
- **Rationale**：只用 CSS，不需要監聽捲動事件，效能和相容性最好。sticky 的範圍限制在 `.answering` 卡片內，換到結果畫面時自然不再固定。**實作時修正**：原本假設 `html` 沒有設定 overflow，但 `global.css` 的 `html, body` 與 `theme.css` 的 `body` 都設了 `overflow-x: hidden`。這會讓 `body` 變成一個「不會捲動的捲動容器」，sticky 在瀏覽器中完全失效（jsdom 的樣式測試抓不到）。改為 `overflow-x: clip`：一樣防止橫向捲動，但不建立捲動容器，sticky 就以視窗為準。並在 `style.test.tsx` 加上回歸測試，禁止再出現 `overflow-x: hidden`。`clip` 支援 Chrome 90+、Safari 16+、Firefox 81+，符合目標平台。
- **Alternatives considered**：
  - `position: fixed`：會脫離版面，要另外補留白，而且電腦上的寬度不好對齊卡片。
  - 用 JS 監聽 scroll：比較複雜，在手機上也容易抖動。

## R6：與斷線提示列的堆疊

- **Decision**：
  - 斷線時，`ConnectionBanner` 同樣以 sticky 固定在 `top: 0`（既有行為）。
  - 新增 token `--connection-banner-h: 2.5rem`，讓提示列固定這個高度（單行置中）。
  - CSS 規則 `.connection-banner ~ .page { --answering-sticky-top: var(--connection-banner-h); }`：提示列出現時，倒數列改停在提示列的正下方。
- **Rationale**：提示列只在斷線時才會出現（`ConnectionBanner` 在線上時回傳 `null`），用兄弟選擇器就能自動切換，不需要改 `StudentPage` 的邏輯。提示文字只有 18 個字，在最窄的 320px 寬度下仍是單行。
- **Alternatives considered**：用 ResizeObserver 量測提示列的高度。對於一段固定的單行文字來說太重了。

## R7：測試策略（憲章原則 IV）

- **Decision**：
  - `countdownPhase.test.ts`：純函式的正常案例與邊界案例（11、10、1、0 秒，`null`，10.4 秒）。
  - `CountdownTimer.test.tsx`：用 fake timers 從 15 秒倒數，確認 `00:11` 時是 `normal`、`00:10` 時切換為 `urgent`；一載入就剩 3 秒時直接是 `urgent`；5 秒的題目從一開始就是 `urgent`；歸零後為 `expired` 並顯示等待文字。
  - `AnsweringView.test.tsx`：送出後倒數仍在；倒數位於 `.answering-head` 內。
  - `MonitorBoard.test.tsx`：同樣的 `endsAt` 下，老師看板輸出相同的 `data-phase`（FR-008）。
  - `style.test.tsx`：jsdom 不能排版，所以改讀 CSS 原始碼，檢查 `.answering-head` 有 sticky 與背景、提示列的偏移規則、作答欄位的 `scroll-margin-top`、`.countdown-urgent` 使用 `--color-accent`，以及 `.countdown-value` 使用 `--color-primary`。
  - 實際的 sticky 效果與 375px 寬度（SC-004）以 quickstart 的手動步驟驗證。
- **Rationale**：本功能沒有新的使用者輸入。原則 I、II 要求的「輸入驗證被拒並顯示正確訊息」由既有的作答秒數驗證（5～600 秒）及其測試涵蓋，本功能不改動。
- **Alternatives considered**：用 Playwright 測試實際的捲動。專案目前沒有 E2E 測試框架，為一條 CSS 規則引入新框架不划算。

## R8：螢幕報讀器

- **Decision**：維持 `role="timer"`、`aria-live="off"`，不在最後 10 秒朗讀剩餘時間。
- **Rationale**：每秒朗讀會干擾學生輸入答案。這是 clarify 階段列為「影響不大、留到規劃決定」的項目。
- **Alternatives considered**：最後 10 秒改成 `aria-live="polite"`。會打斷正在輸入的學生，所以不採用。
