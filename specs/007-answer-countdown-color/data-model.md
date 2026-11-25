# Data Model：學生作答頁倒數計時與最後十秒變色提醒

本功能**不新增、不修改任何持久化資料**，也不改 API 或 socket 事件。以下是前端在畫面上推導出來的狀態。

## 1. 既有輸入（唯讀）

| 名稱 | 來源 | 欄位 | 說明 |
|------|------|------|------|
| `StudentView`（002） | `shared/src/types.ts`，由 socket `state:update` 推播 | `phase`、`question`、`endsAt`、`myTeamSubmission` | `phase === 'ANSWERING'` 時才會顯示作答畫面；`endsAt` 是伺服器算好的結束時間點（ISO 字串） |
| `clockOffset`（002） | `useStudentState` | number（ms） | 伺服器時間減去裝置時間，用來抵銷裝置時鐘的誤差 |
| 作答秒數（004） | 老師開始搶答時輸入 | 整數 5～600 | 驗證沿用既有規則（`shared/src/activity.ts` 的 `MIN_SECONDS`、`MAX_SECONDS`），本功能不改 |

## 2. `Countdown`（002，不改）

由 `useServerCountdown(endsAt, clockOffset)` 每 250 ms 重新計算：

| 欄位 | 型別 | 規則 |
|------|------|------|
| `remainingMs` | `number \| null` | `max(0, endsAt − (Date.now() + clockOffset))`；沒有 `endsAt` 時為 `null` |
| `remainingSec` | `number` | `ceil(remainingMs / 1000)`，也就是畫面上顯示的秒數 |
| `expired` | `boolean` | `remainingMs === 0` |

## 3. `CountdownPhase`（新增，`frontend/src/components/countdownPhase.ts`）

`type CountdownPhase = 'normal' | 'urgent' | 'expired'`，由 `countdownPhase(c: Countdown)` 推導：

| 條件（依序判斷） | 階段 | 畫面 | 顏色 |
|------------------|------|------|------|
| `c.expired` | `expired` | 「時間到，等待結果」（老師看板為「時間到，結算中」） | `--color-primary`（與老師端現況相同） |
| `c.remainingMs === null` | `normal` | `00:00`（沒有倒數資料時的保底） | `--color-primary` 深藍 |
| `c.remainingSec <= URGENT_SEC`（10） | `urgent` | `mm:ss` | `--color-accent` 橘 |
| 其他 | `normal` | `mm:ss` | `--color-primary` 深藍 |

`URGENT_SEC = 10` 只在這個檔案定義一次，學生作答頁和老師看板共用（FR-008）。

### 狀態轉換

```text
          remainingSec 由 11 變成 10           remainingMs 變成 0
normal  ───────────────────────────▶  urgent  ─────────────────▶  expired
   │                                                                 ▲
   └────────── 作答秒數 ≤ 10，或載入時已剩 ≤ 10 秒：直接從 urgent 開始 ┘
   （老師手動提前結束：phase 離開 ANSWERING，倒數元件直接卸載）
```

- 階段只會往前走，不會倒退；`endsAt` 在同一題中不會改變。
- 換題時，`AnsweringView` 以 `questionId` 作為 key 重新掛載，階段依新題目的 `endsAt` 重新計算。

## 4. 版面狀態（CSS，無資料）

| 名稱 | 值 | 用途 |
|------|----|------|
| `--answering-sticky-top` | 預設 `0`；斷線提示列出現時為 `var(--connection-banner-h)` | 倒數列固定的位置（FR-012） |
| `--connection-banner-h` | `2.5rem` | 斷線提示列的固定高度 |
| `--answering-head-h` | `5rem` | 作答欄位的 `scroll-margin-top`，避免欄位被倒數列蓋住 |
