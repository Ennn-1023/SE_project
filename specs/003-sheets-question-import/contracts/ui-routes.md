# UI Routes: 學習單題目匯入（F3＋F4）

沿用 001 的路由守衛（`Guard`）：未登入導向 `/login`，角色不符顯示「此功能僅限老師使用」。權限以後端為準。

| 路徑 | 角色 | 頁面／元件 | 說明 |
|---|---|---|---|
| `/teacher` | TEACHER | `TeacherDashboard` | 既有頁面；新增「題目管理」按鈕（FR-033），學生帳號與組別面板不變 |
| `/teacher/questions` | TEACHER | `QuestionManagePage` | 題目管理（本功能所有畫面） |

## `/teacher/questions` 的畫面狀態

```text
               ┌──────────── Google 未設定 ───────────┐
               │ 顯示「系統尚未設定 Google 試算表串接」 │
               └───────────────────────────────────────┘
進入頁面 ──► GET /google/status、GET /question-set、GET /question-import/drafts/current
   │
   ├─ 有未過期草稿 ─────────────────────────────► [標註]
   ├─ 未連結 ──► [連結 Google] ─(Google 授權)─► 回到本頁 ?google=…
   └─ 已連結 ──► [目前題目集＋貼上連結表單]
                     │ 讀取學習單（POST drafts）
                     ▼
                  [標註] SheetGrid＋AnnotationPanel（自動儲存）
                     │ 預覽匯入（POST preview）     ▲ 返回修改
                     ▼                              │
                  [預覽] ImportPreview ─────────────┘
                     │ 確認匯入（POST confirm）
                     ▼
                  [目前題目集] QuestionSetView
```

## 查詢參數 `?google=`

| 值 | 顯示 |
|---|---|
| `connected` | 「已連結 Google 帳號：<email>」 |
| `denied` | 「未完成 Google 帳號連結，請再試一次」 |
| `scope_missing` | 「需要同意存取 Google 試算表，才能匯入學習單」 |
| `state_invalid` | 「連結請求已失效，請重新按『連結 Google 帳號』」 |
| `error` | 「暫時無法完成 Google 帳號連結，請稍後再試」 |

顯示後以 `history.replaceState` 移除參數，避免重新整理時重複顯示。

## 版面（FR-034）

- ≥ 1024 px：左側 `SheetGrid`（可捲動區塊）、右側 `AnnotationPanel`（固定寬度）。
- 640–1023 px：同上，`AnnotationPanel` 較窄。
- < 640 px：`SheetGrid` 佔滿寬度，`AnnotationPanel` 為底部可展開面板（收合時顯示目前步驟提示，例如「請點選第 3 題的作答格」）。
- 頁面本身無水平捲動；縮放按鈕（−／＋，50%～200%）位於格子上方，觸控區 ≥ 44 px。
