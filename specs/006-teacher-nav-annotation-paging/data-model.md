# Data Model：老師端側邊選單導覽與題目標註逐題切換

**Feature**：[spec.md](spec.md) | **Plan**：[plan.md](plan.md)

本功能**不新增也不修改任何持久化資料**（資料庫、試算表 metadata、標註草稿都不變，見 FR-024）。以下只列出前端的畫面狀態與型別，對應 [006-class.puml](../../diagrams/006-class.puml)。

---

## 1. TeacherNavItem（老師導覽項目）

位置：`frontend/src/components/teacherNav.ts`

| 欄位 | 型別 | 規則 |
|------|------|------|
| `label` | `string` | 顯示名稱，只能是「搶答活動」「題目管理」「學生管理」 |
| `path` | `string` | 對應路由，必須以 `/teacher` 開頭 |

`TEACHER_NAV_ITEMS` 固定 3 項，順序不可變（FR-003）：

| # | label | path | 判斷為目前項目的條件（`isCurrentNav`） |
|---|-------|------|------------------------------|
| 1 | 搶答活動 | `/teacher` | pathname 去掉結尾 `/` 後剛好是 `/teacher` |
| 2 | 題目管理 | `/teacher/questions` | pathname 以 `/teacher/questions` 開頭 |
| 3 | 學生管理 | `/teacher/students` | pathname 以 `/teacher/students` 開頭 |

## 2. 側邊選單狀態

位置：`TeacherLayout` 內部。

| 狀態 | 型別 | 初始值 | 轉換 |
|------|------|--------|------|
| `menuOpen` | `boolean` | `false` | 以下情況會改變它：<br>• 按三條線按鈕 → 反轉<br>• 點選項目 → `false`（並導向該路由）<br>• 按 Esc → `false`<br>• 點遮罩 → `false`<br>• pathname 改變 → `false` |

只要 `menuOpen` 從 `true` 變成 `false`，焦點就回到三條線按鈕。

## 3. 目前這一題（CurrentQuestion）

位置：`useAnnotationEditor`，位於 `frontend/src/questions/AnnotationPanel.tsx`。

| 衍生值 | 定義 |
|--------|------|
| `currentKey` | 內部狀態 `rawKey`，存在於 `doc.questions` 時就用它；否則用 `doc.questions[0]?.key ?? null` |
| `currentIndex` | `doc.questions.findIndex(q => q.key === currentKey)`，沒有題目時為 `-1` |
| 位置提示 | `第 ${currentIndex + 1} 題／共 ${doc.questions.length} 題`（沒有題目時不顯示） |
| 可按上一題 | `currentIndex > 0` |
| 可按下一題 | `currentIndex >= 0 && currentIndex < doc.questions.length - 1` |

### 狀態轉換

假設目前在第 i 題（從 0 起算），共 N 題。

| 操作 | 新的 `currentKey` | 附帶效果 | 依據 |
|------|------------------|----------|------|
| 載入或替換 doc，且原 key 不在其中 | 第 1 題的 key，沒有題目時為 `null` | — | FR-023 |
| `addQuestion()`（未達上限） | 新題目的 key | 進入「題目格」指定步驟 | FR-016 |
| `addQuestion()`（已達上限） | 不變 | 顯示上限訊息 | Edge Cases |
| `goPrev()` | 第 i−1 題（i > 0 才有作用） | 取消步驟、清除提示訊息 | FR-015、FR-019 |
| `goNext()` | 第 i+1 題（i < N−1 才有作用） | 同上 | FR-015、FR-019 |
| `goTo(key)` | `key`（不存在時不動作） | 同上 | FR-020、FR-022 |
| `removeQuestion(currentKey)` | 依剩下的題目決定：<br>• 原第 i+1 題存在 → 它<br>• 否則原第 i−1 題存在 → 它<br>• 都沒有 → `null` | 刪除後如果步驟指向這一題，一併取消 | FR-017 |
| `removeQuestion(其他題)` | 不變 | — | — |
| `move(currentKey, ±1)` | 不變（key 跟著移動，`currentIndex` 變成 i±1） | — | FR-018 |
| `clearAll()` | `null` | 取消步驟 | Edge Cases |

## 4. QuestionOverviewItem（總覽項目）

位置：`frontend/src/questions/AnnotationPanel.tsx`，由 `overviewOf(doc, validation, currentKey)` 產生。

| 欄位 | 型別 | 規則 |
|------|------|------|
| `key` | `string` | 題目的 key |
| `title` | `string` | `titleOf(q, index)`，例如「第 3 題」 |
| `hasIssue` | `boolean` | `validation.issues` 中有任何一筆的 `questionKey` 等於這一題時為 `true`。`warnings` 不算 |
| `current` | `boolean` | `key === currentKey` |

## 5. CellMark（格線角標，擴充）

位置：`frontend/src/questions/SheetGrid.tsx`

| 欄位 | 型別 | 規則 |
|------|------|------|
| `label` | `string` | 沿用 003（題1、答1-2、幹3） |
| `tone` | `MarkTone` | 沿用 003 |
| `current` | `boolean?`（006 新增） | 由 `marksFor(doc, currentKey)` 設定，只有目前這一題的角標為 `true` |

## 6. 驗證規則摘要

- 標註資料的驗證完全沿用 003 的 `validateAnnotations`，本功能不新增規則。
- `goTo` 只接受存在於 `doc.questions` 的 key，其他一律不動作，不會丟出錯誤。
- 路由權限：`/teacher`、`/teacher/questions`、`/teacher/students` 都由 `Guard(role=TEACHER)` 保護。資料的實際權限仍以後端 001 的 `RequireRole` 為準。
