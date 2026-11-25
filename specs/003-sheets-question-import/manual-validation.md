# 手動驗證紀錄（T092）

**狀態**：完成（2026-11-24）。17 個情境中 15 個以真實 Google 實測通過；情境 1、2 未單獨實測（老師已先完成設定與連結），由自動化測試涵蓋。驗證中發現的使用性問題（窄螢幕遮擋）已修正並重新驗證。

依 [quickstart.md](quickstart.md) §5 的 17 個情境，以真實 Google 帳號（老師本人授權）與範例學習單操作；系統在本機開發伺服器（localhost:3000／5173）執行，瀏覽器以老師身分登入（由老師本人輸入密碼）。

## 執行結果

| 情境 | 結果 | 觀察 |
|---|---|---|
| 1 未設定 Google | 未執行 | 老師已先完成 Google 設定；此情境由自動化測試涵蓋 |
| 2 取消連結 | 未單獨記錄 | 老師完成連結流程；取消路徑由自動化測試涵蓋 |
| 3 連結並同意 | ✅ 通過 | 題目管理顯示「已連結 Google 帳號：<老師的 Google 帳號>」 |
| 4 貼 Google 文件連結 | ✅ 通過 | 前端擋下，顯示「請貼上 Google 試算表連結」與範例網址；網路紀錄中沒有送出 `POST /drafts` |
| 5 讀取單題範例 | ✅ 通過 | 201；分頁「學習單」；C5～F5、G5～H5 為合併格；題號 1～6 位於 B5～B15 |
| 6 標註 6 題 | ✅ 通過 | 在畫面上逐題點選；伺服器草稿為題號 1～6、題目格 C5～C15、作答格 G5～G15；同一格重複指定時顯示「G5 已是第 1 題的作答格，請先移除原本的標註」 |
| 7 未完成就預覽 | ✅ 通過 | 列出「第 4 題缺少作答格（請點選該題的作答格）」，未進入預覽 |
| 8 確認匯入且試算表不變 | ✅ 通過 | 匯入老師的單題範例副本 6 題；老師以試算表「版本記錄」確認儲存格未變 |
| 9 題組範例取代題目集 | ✅ 通過 | 題組範例副本 4 題、6 個作答格（第 1、2 題各 2 小題、作答 H 欄；第 3、4 題作答 G 欄）；預覽時提示將取代原題目集 |
| 10 插入 2 列後重新匯入 | ✅ 通過 | 帶回 6 題（restoredCount 6），位置由 C5/G5～C15/G15 順延為 C7/G7～C17/G17，沒有提醒 |
| 11 刪除作答欄後重新匯入 | ✅ 通過 | 老師刪除副本的 G 欄後按「重新匯入」→ 201，帶回 6 題（restoredCount 6），題目格仍正確對應目前位置；作答格皆為未指定，並附 6 則「第 N 題的作答格已不存在，請重新指定」；預覽 → 422「標註尚未完成或有錯誤（共 6 項）」 |
| 12 標註期間修改學習單 | ✅ 通過 | 讀取副本（重新匯入後的草稿）後，老師在副本修改 C7 文字；預覽仍顯示讀取當下的內容（所見即所得）；確認匯入 → 409 `SHEET_CHANGED`「學習單在標註期間被修改」；題目集的匯入時間與內容未變 |
| 13 375px 手機 | ✅ 通過 | 頁面寬 375、無水平捲動；格子區塊 `overflow: auto`、格子高 44px；標註面板固定於底部；新增題目 → 收合 → 點題目格／作答格可正常標註。觀察：面板展開時約佔畫面 60%，需先手動收合才能點到被遮住的格子 |
| 14 學生存取 | ✅ 通過 | 以學生帳號開 `/teacher/questions` 顯示「此功能僅限老師使用」；以學生身分呼叫 8 個 API（status、oauth/start、DELETE connection、GET/DELETE question-set、reimport、drafts/current、POST drafts）全部 403 `FORBIDDEN`；資料庫的題目集與事件紀錄未變 |
| 15 中斷連結 | ✅ 通過 | 老師按「中斷 Google 連結」並確認 → 狀態 `connected: false`，畫面回到「連結 Google 帳號」，「重新匯入」停用；資料庫的連結資料已刪除並記錄 `GOOGLE_DISCONNECTED`；目前題目集（Q1，6 題）保留。老師已確認 Google 帳號「第三方存取」頁面中本應用程式已移除 |
| 16 不外洩機敏資料 | ✅ 通過（部分） | 4 個 API 回應不含 token／授權碼／client secret；資料庫 7 張表無 Google token 明文，連結資料為 `iv.tag.ciphertext` 加密格式。後端 log 未能直接檢視（伺服器於先前工作階段啟動），由 `questionNoSecrets.test.ts` 涵蓋 |
| （觀察）窄螢幕遮擋 | ✅ 已修正 | 原問題：寬度 < 640px 時，展開的標註面板（約 60% 高）會遮住其下方的格子與「預覽匯入」按鈕，需先按「收合」。修正（`QuestionManagePage.tsx`、測試 `frontend/tests/narrowScreen.test.tsx`）：窄螢幕時開始點選步驟即自動收合面板、步驟完成後自動展開，收合列另提供「預覽匯入」；寬螢幕行為不變。重新驗證（375px）：按「指定作答格」後面板收合、格子完整露出，點 G7 後標上「答2」並自動展開，頁面無水平捲動 |
| 17 只有檢視權限 | ✅ 通過 | 對原始單題範例（老師僅有檢視權限）按確認匯入 → 403 `SHEET_NO_EDIT_PERMISSION`「你連結的 Google 帳號沒有這份試算表的編輯權限，無法保存標註」，題目集未變 |

## 已由自動化測試涵蓋的部分（不連線 Google，使用 FakeGoogle）

| 情境 | 對應的自動化測試 |
|---|---|
| 1 未設定 Google | `backend/tests/integration/google.oauth.test.ts`「Google 串接未設定」、`frontend/tests/GoogleConnectionPanel.test.tsx` |
| 2、3 取消／完成連結 | `google.oauth.test.ts`（denied、connected）、`GoogleConnectionPanel.test.tsx`（`?google=` 訊息） |
| 4 非試算表連結 | `questionImport.read.test.ts`、`QuestionManagePage.test.tsx`、`shared/tests/annotation.test.ts` |
| 5～8 讀取、標註、預覽、匯入且試算表內容不變 | `questionImport.read／annotate／confirm.test.ts`、`AnnotationPanel.test.tsx`、`ImportPreview.test.tsx` |
| 9 題組範例取代題目集 | `questionImport.confirm.test.ts`「已有 6 題時匯入 4 題」 |
| 10、11 插入列、刪除欄後重新匯入 | `questionSet.reimport.test.ts`、`annotationCodec.restore.test.ts` |
| 12 標註期間被修改 | `questionImport.confirm.test.ts`（SHEET_CHANGED） |
| 13 375px 手機 | `frontend/tests/style.test.tsx`「題目管理頁的 RWD」（版面 class 檢查；實機觸控仍需手動確認） |
| 14 學生存取 | `questionAuth.test.ts`、`routeGuards.test.tsx` |
| 15 中斷連結 | `google.oauth.test.ts`、`questionSet.clear.test.ts`、`QuestionManagePage.test.tsx` |
| 16 機敏資料不外洩 | `questionNoSecrets.test.ts` |
| 17 只有檢視權限 | `questionImport.confirm.test.ts`（SHEET_NO_EDIT_PERMISSION） |

## 只能以真實 Google 驗證的項目

- Google 實際的 developer metadata 行為：插入／刪除列欄時是否如 research R3 所述移動或刪除（FakeGoogle 依文件規則模擬）。
- SC-006 的「格式與附註未改變」：匯入前後以試算表「版本記錄」確認。
- spec Edge Cases 的剪下貼上與排序後重新匯入的實際結果。
- OAuth 同意畫面、測試模式 7 天授權期限的實際提示。

## 執行後請填寫

| 情境 | 結果（通過／失敗／未執行） | 備註 |
|---|---|---|
| 1～17 | | |
