# UI Routes Contract — F0/F1/F2

前端頁面路由與存取規則。元件名稱對應 [`diagrams/001-component.puml`](../../../diagrams/001-component.puml)。

| 路徑 | 頁面／元件 | 允許角色 | 未登入 | 角色不符 |
|------|-----------|----------|--------|----------|
| `/login` | `LoginPage` | 所有人 | 顯示 | 已登入者依角色導向 `/teacher` 或 `/student` |
| `/teacher` | `TeacherDashboard`（內含 `StudentCreatePanel`、`GroupManagePanel` 與學生清單） | TEACHER | 導向 `/login` | 顯示「此功能僅限老師使用」並提供回首頁按鈕 |
| `/student` | `StudentHome`（組別狀態、選組） | STUDENT | 導向 `/login` | 顯示「此頁僅限學生使用」 |
| `/account/password` | `ChangePasswordForm` | 已登入者 | 導向 `/login` | — |
| `/` | 依登入狀態與角色導向 | — | 導向 `/login` | — |
| 其他 | 404 頁 | — | — | — |

## 共通規則

- 頁面載入時呼叫 `GET /api/auth/me` 決定登入狀態與角色；任何 API 回 401 時清除前端狀態並導向 `/login`。
- 前端角色檢查只負責導向與隱藏，**權限以後端檢查為準**（FR-021）。
- 所有頁面套用 `UI 風格系統`（`frontend/src/styles/theme.css`）的 token；錯誤一律以 `ErrorMessage` 元件顯示 `message` 與 `hint`。
- 版面在 320–1920 px 寬度皆不可出現水平捲動；可點擊元件最小 44×44 px（FR-004）。

## 學生首頁狀態

| 條件 | 顯示 |
|------|------|
| `groupCount = 0` | 「老師尚未開放分組」，無選組控制項 |
| `groupNumber = null` 且 `groupCount > 0` | 「尚未分組」＋ 1..N 的組別按鈕 |
| `groupNumber = g` | 「你在第 g 組」，無選組控制項 |
