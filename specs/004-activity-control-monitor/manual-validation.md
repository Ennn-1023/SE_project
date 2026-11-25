# 驗證紀錄（T079，憲章原則 V）

**日期**：2026-11-24 | **分支**：`004-activity-control-monitor`

## 1. 自動化檢查（已實際執行）

| 指令 | 結果 |
|------|------|
| `npm run lint` | 通過（0 個問題） |
| `npm run typecheck` | 通過（shared、backend、frontend） |
| `npm test` | 全部通過：shared 4 個檔案／71 項、backend 64 個檔案／784 項、frontend 32 個檔案／239 項，共 1,094 項（含 Phase 10 Convergence 的 T080、T081），0 失敗、0 略過 |
| `npm run build -w frontend` | 建置成功 |
| `npm run test -w backend -- tests/architecture/diagram-consistency` | 243 項通過（含 004 組件圖、類別圖與檔案對照） |
| `java -jar plantuml.jar "./diagrams/*.puml"` | 重新產生 PNG，004 的 `.puml` 與 PNG 時間戳記同步 |

本功能新增或修改的測試對照 spec 的情況見 [quickstart.md §2](quickstart.md)；004 新增的測試檔：

- shared：`activity.test.ts`
- backend unit：`activityStateMachine`（改寫）、`submissionService`、`resultService`、`visibilityFilter`（更新）、`monitorViewBuilder`、`activityLockGuard`、`migrations`（v4）
- backend integration：`activity.start`、`activity.open`、`activity.close`、`activity.reopen`、`activity.end`、`activity.lock`、`activity.auth`、`activity.restart`、`activity.result`、`monitor.sync`、`monitor.isolation`、`submit.parts`、`presence`；002 的 buzzer 類測試改用 helper 建立 mock 活動
- frontend：`ActivityControlPage`、`OpenQuestionForm`、`MonitorBoard`、`ResultBoard`、`AnsweringView`／`ResultView`／`StudentPage`／`DevTeacherPanel`（更新）、`narrowScreen`（活動頁 10／50 組）

## 2. 瀏覽器手動驗證（quickstart.md §3）— 2026-11-24 已執行（老師端）

環境：使用者本機已在執行的開發伺服器（前端 5173、後端 3000）與本機資料庫；老師帳號由使用者自行登入。題目集為使用者先前以 003 匯入的學習單（6 題），組別 20 組、僅第 19 組有 1 位學生（未上線）。為了自動操作，以腳本暫時讓 `window.confirm` 自動同意並記錄確認文字。

| 情境 | 結果 | 備註 |
|------|------|------|
| 資料庫升級（migration v4） | 通過 | 002 的 mock 活動 A1 顯示為「活動結束」，題目皆未開放 |
| 3.1 開始新活動 | 通過 | 確認文字「確定要開始新活動嗎？上一場的結果會保留…」；6 題複製、預選第 1 題、進度 0／6 |
| 3.1 活動中鎖定題目集 | 通過 | 確認匯入回 409「搶答活動進行中，無法變更題目集」；結束活動後同一請求改回 404（鎖定解除） |
| 3.2 秒數驗證 | 通過 | 輸入 4 顯示「作答秒數須為 5～600 的整數」 |
| 3.2 開放與監控看板 | 通過 | 倒數、「已送出 0／1 組」、投影提醒、第 19 組「未送出・離線」 |
| 3.3 時間到自動結束 | 通過 | 8 秒後自動結束，「結束原因：時間到」「本題無組別送出答案」，結果下方預選第 2 題 |
| 3.3 直接開放下一題、手動結束 | 通過 | 從結果畫面直接開放第 2 題；手動結束確認文字正確，「結束原因：手動結束」，預選第 3 題 |
| 3.3 回顧已結束題目 | 通過 | 題目清單點第 1 題開啟結果對話框 |
| 3.4 重新開放 | 通過 | 確認文字「重新開放會取代第 1 題目前的結果（無人送出）…」；對話框關閉、第 1 題重新作答 01:00 |
| 3.5 重新整理 | 通過 | 作答中重新整理後回到監控看板，剩餘時間正確（00:54） |
| 3.7 作答中結束活動 | 通過 | 確認文字說明會先結束本題與「尚有 4 題未開放」；顯示活動摘要與「開始新活動」 |
| 3.8 375 px 版面 | 通過 | `scrollWidth` = 375（無水平捲動），所有按鈕與連結高度 ≥ 44 px，單欄排列 |
| 學生端畫面、送出、在線人數（3.2 送出、3.6） | 未執行 | 本機沒有可用的學生登入；已由整合測試涵蓋（`monitor.sync`、`monitor.isolation`、`submit.parts`、`presence`） |
| 3.5 斷線、伺服器重啟 | 未執行 | 需中斷使用者自己的開發伺服器；已由整合測試涵蓋（`activity.restart`）與前端測試（斷線停用操作） |
| SC-001 30 秒內完成 | 未計時 | 以自動操作完成「開始活動 → 開放第 1 題」約數秒，非真人操作時間 |

**發現並修正的問題**：作答中投影提醒在頁面上重複出現兩次（看板內一次、另有一個只給螢幕報讀器的副本），已移除副本；前端測試 237 項與 lint 重新執行皆通過。

**驗證後的資料狀態**：本機資料庫留下一場已結束的測試活動（第 1、2 題無人送出），不影響之後開始新活動；題目集未被變更。
