# UI 合約：倒數元件與作答頁倒數列

本功能不改 REST API 或 socket 事件。以下是畫面對外（測試、樣式、老師端看板）保證的介面。

## 1. `countdownPhase.ts`（新增）

```ts
export const URGENT_SEC = 10;
export type CountdownPhase = 'normal' | 'urgent' | 'expired';
export function countdownPhase(c: Countdown): CountdownPhase;
```

| 輸入（`remainingMs`、`remainingSec`、`expired`） | 輸出 |
|---------------------------------------------------|------|
| `11000, 11, false` | `normal` |
| `10400, 11, false`（顯示 `00:11`） | `normal` |
| `10000, 10, false` | `urgent` |
| `1, 1, false` | `urgent` |
| `0, 0, true` | `expired` |
| `null, 0, false`（沒有 `endsAt`） | `normal` |

## 2. `CountdownTimer`（調整）

```ts
export interface CountdownTimerProps {
  endsAt: string | undefined;
  clockOffset: number;
  expiredText?: string; // 預設「時間到，等待結果」
}
export function CountdownTimer(props: CountdownTimerProps): JSX.Element;
```

輸出的 DOM（既有結構不變，只新增 `data-phase`）：

```html
<div class="countdown [countdown-urgent]" data-phase="normal|urgent|expired">
  <span class="countdown-label">剩餘時間</span>
  <span role="timer" aria-live="off" class="countdown-value">01:00 | 時間到，等待結果</span>
</div>
```

- 只有 `data-phase="urgent"` 時才會有 `countdown-urgent` class（與現況相同）。
- 學生作答頁與老師看板使用同一個元件，因此在相同的 `endsAt` 與時間下，兩端的 `data-phase` 一定相同（FR-008）。

## 3. 樣式合約（`frontend/src/styles/global.css`、`tokens.css`）

| 選擇器 | 必要宣告 | 對應 |
|--------|----------|------|
| `.countdown-value` | `color: var(--color-primary)` | FR-005 深藍 |
| `.countdown-urgent .countdown-value` | `color: var(--color-accent)` | FR-006、FR-007 橘（與老師端相同） |
| `.answering-head` | `position: sticky`、`top: var(--answering-sticky-top, 0)`、不透明背景、`z-index` 低於 `.connection-banner` | FR-012 |
| `.connection-banner` | `height`／`min-height: var(--connection-banner-h)` | R6 |
| `.connection-banner ~ .page` | `--answering-sticky-top: var(--connection-banner-h)` | R6 |
| `.answering textarea`、`.answering input` | `scroll-margin-top: var(--answering-head-h, 5rem)` | FR-012「不遮住作答欄位」 |
| `html, body`（global.css）、`body`（theme.css） | `overflow-x: clip`（不可用 `hidden`） | FR-012：避免 body 成為捲動容器使 sticky 失效 |

色票值不改：`--color-primary: #1f3a93`、`--color-accent: #ff6b4a`（`tokens.css` 與 `theme.css` 同名同值）。

## 4. `AnsweringView`（調整）

- 題號徽章與 `CountdownTimer` 維持放在 `<div class="answering-head">` 內，成為捲動時固定的那一列。
- 本組送出後，`answering-head` 與倒數仍然保留（FR-011）。
- props 不變：`{ view, clockOffset, offline }`。
