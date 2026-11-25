# Research：老師端側邊選單導覽與題目標註逐題切換

**Feature**：[spec.md](spec.md) | **Plan**：[plan.md](plan.md) | **Date**：2026-11-25

本文件記錄 Phase 0 的設計決策。技術棧沿用 001～005，Technical Context 沒有 NEEDS CLARIFICATION 項目。以下處理規格裡「要怎麼做」還沒定的地方。

---

## R1. 以設計圖為藍圖（憲章原則 VI）

- **Decision**：以 `diagrams/006-component.puml`、`006-class.puml`、`006-sequence-navigation.puml`、`006-sequence-annotation-paging.puml` 為藍圖。plan 階段調整了類別圖：元件以 Props 介面表示，`AnnotationEditor` 的成員以屬性（函式型別）表示，與程式中 `addQuestion: () => void` 的寫法一致。調整後已重新產生 PNG。
- **Rationale**：`diagram-consistency.test.ts` 比對類別圖時，介面的「方法」只認 `name(` 語法，屬性則認 `name:`。前端元件與 hook 回傳型別一律用屬性語法，類別圖照著畫才能自動驗證。
- **Alternatives considered**：
  - 把類別圖畫成 class＋方法 → 程式沒有對應的類別，驗證不了，否決。
  - 不把 006 納入架構測試 → 違反「實作後須驗證一致」，否決。

## R2. 老師主頁的路由安排

- **Decision**：
  - `/teacher` 顯示 `ActivityControlPage`。
  - `/teacher/activity` 用 `<Navigate to="/teacher" replace />` 導回去，舊書籤仍可用。
  - 新增 `/teacher/students`，顯示 `StudentManagePage`。
  - `/teacher/questions` 不變。
  - `homePathFor('TEACHER')` 維持 `/teacher`。
- **Rationale**：登入落地點不必改，就能符合 FR-001；選單裡的搶答活動只對應 `/teacher` 一個網址，判斷「目前所在項目」也單純。
- **Alternatives considered**：
  - `homePathFor` 改成 `/teacher/activity` → 舊書籤 `/teacher` 還得另外處理，而且 LoginPage 測試也要改，否決。
  - `/teacher` 與 `/teacher/activity` 兩個網址都直接渲染同一頁 → 選單的目前項目判斷要處理兩個網址，否決。

## R3. 側邊選單（抽屜）的實作方式

- **Decision**：
  - 自己寫 `SideMenu`：固定在左側的面板（寬 `min(80vw, 18rem)`），外加半透明遮罩。
  - 用 `role="dialog"`、`aria-modal="true"`。
  - 打開時焦點移到第一個項目；按 Esc 或點遮罩就關閉，焦點回到觸發按鈕。
  - 開關用 `translate-x` 做過場動畫，並遵守 `prefers-reduced-motion`。
  - 在選單內做簡單的焦點循環：攔截第一項的 Shift+Tab 與最後一項的 Tab，讓焦點在選單項目間繞圈，不會跑到被遮罩蓋住的背景。只有 3 個連結，用 keydown 處理就夠了，不需要另外的焦點鎖定套件。
- **Rationale**：只有 3 個項目，需求簡單，不值得為此加 UI 套件；也和現有「不新增執行期套件」的做法一致。
- **Alternatives considered**：
  - 原生 `<dialog>` 加 `showModal()` → jsdom 對它支援不完整，測試要另外補 polyfill，否決。
  - 引入 Headless UI 或 Radix → 新增依賴，否決。
  - 桌面寬度常駐側欄 → 與使用者描述的「按下才彈出」不符（spec Assumptions），否決。

## R4. 老師頁框的組成

- **Decision**：
  - `Layout` 新增選填的 `leading?: ReactNode`，渲染在頁首最左側，原本的「課程搶答系統」標題之前。
  - `TeacherLayout({ title, children })` 持有 `menuOpen`，把三條線按鈕當作 `leading` 傳給 `Layout`，再在旁邊渲染 `SideMenu`。
  - 三個老師頁面都改用 `TeacherLayout`。學生頁面與 `ChangePasswordForm` 繼續用 `Layout`。
- **Rationale**：頁首的 RWD 排版、使用者名稱、修改密碼與登出都已寫在 `Layout` 裡，重用它可以避免兩份頁首走樣。學生端不傳 `leading`，所以完全不受影響（FR-007）。
- **Alternatives considered**：
  - 用 react-router 的巢狀路由加 `<Outlet>` 做 `TeacherShell` → 各頁標題要改由路由提供，改動面比較大，否決。
  - `Layout` 依照 `user.role` 自己顯示選單 → 修改密碼頁也會出現選單，而且讓共用頁框依賴角色，否決。

## R5. 「目前這一題」狀態放在哪裡、怎麼表示

- **Decision**：
  - 放在 `useAnnotationEditor` 裡：`const [currentKey, setCurrentKey] = useState<string | null>(null)`。
  - 對外的 `currentKey` 經過正規化：如果找不到對應的題目，有題目時就用第 1 題的 key，沒有題目時為 `null`。
  - `currentIndex = doc.questions.findIndex(q => q.key === currentKey)`，沒有題目時為 -1。
  - 各操作：
    - `addQuestion` → 設為新題目的 key。
    - `removeQuestion(key)` → 刪的是目前這一題時，改設為後一題的 key，沒有後一題就設為前一題。
    - `clearAll` → 設為 `null`。
    - `goTo`、`goPrev`、`goNext` → 先取消進行中的步驟再切換。
- **Rationale**：
  - 用 key 而不用位置，上下移動時目前這一題自然跟著移動（FR-018），刪除其他題目也不會跳錯題。
  - 由 `doc` 推導、不另外同步 effect：外部換掉 doc（重新載入草稿、別的視窗衝突後重新取得）時，會自動回到第 1 題（FR-023），不會出現短暫錯亂。
  - 新增、刪除、取消步驟本來就在這個 hook 裡，放在一起狀態最一致。
- **Alternatives considered**：
  - 存位置 `currentIndex` → 每次上下移動、刪除都要手動調整，容易出錯，否決。
  - 放到 `QuestionManagePage` → `addQuestion` 要再回呼通知頁面，容易漏掉，否決。
  - 存進 `useAnnotationDraft` 或草稿 → 會變成要自動儲存的資料，違反 FR-024（只改呈現），否決。

## R6. 「前往第 N 題」與格線角標

- **Decision**：
  - `ownerOf()` 的回傳值多帶 `key`。
  - 沒有進行中的步驟、選取格屬於其他題時，選取格資訊旁顯示「前往第 N 題」按鈕，按下即 `goTo(key)`。
  - 正在指定格子時點到其他題的格子，維持現行行為：顯示「已是第 N 題的作答格，請先移除原本的標註」，不提供跳題，以免中斷步驟。
  - `marksFor(doc, currentKey)` 替目前這一題的角標加上 `current: true`。`SheetGrid` 對 `current` 的角標加粗外框（`ring-2`）並放到最上層，其他題的角標維持原樣（FR-021）。
- **Rationale**：格子是老師找題目最直覺的入口。醒目樣式採外框，而不只是換顏色，色弱使用者也分辨得出來。
- **Alternatives considered**：
  - 點到其他題的格子就自動跳題 → 老師可能只是想看格子內容，會意外跳走，否決。
  - 只顯示目前這一題的角標 → 老師看不出哪些格子已被其他題佔用，容易重複指定，否決。

## R7. 錯誤標示與總覽

- **Decision**：
  - `overviewOf(doc, validation, currentKey)` 是純函式，回傳每題的 `{ key, title, hasIssue, current }`。
  - 只有 `validation.issues`（會擋下匯入的錯誤）才算 `hasIssue`，`warnings` 不算。
  - 總覽按鈕：有錯時文字前加「⚠」，`aria-label` 寫成「第 N 題，有錯誤」。
  - 沒有對應題目的錯誤（`questionKey` 為空，例如「至少需要一題」）仍顯示在面板上方，與現行相同。
- **Rationale**：符合 FR-022「不只靠顏色」。只標會擋匯入的錯誤，提醒（warnings）不至於讓總覽一片警示。
- **Alternatives considered**：
  - 提醒也標示 → 雜訊太多，否決。
  - 用 `<select>` 下拉選單 → 看不出哪幾題有錯，不符合 SC-003 的「一次點擊到達」，否決。

## R8. 早期設計圖與對照表的同步

- **Decision**：實作時在同一次變更裡完成以下修改：
  - `diagrams/001-component.puml`、`003-component.puml`、`004-component.puml`：組件 `老師管理頁\nTeacherDashboard` 改為 `學生管理頁\nStudentManagePage（006 由 TeacherDashboard 改名）`，並重新產生 PNG。
  - 001／003／004 的 `plan.md` 組件對照表：`TeacherDashboard` 改為 `StudentManagePage → frontend/src/pages/StudentManagePage.tsx`，並加註「006 改名」。
  - `diagrams/student-component.puml`：移除 `DevPanel`，加註「006 移除前端開發工具，後端 /api/dev 保留」，並重新產生 PNG。
  - `diagram-consistency.test.ts`：加入 `set006`，把 006 也納入檔案對照集合。
- **Rationale**：憲章要求圖表與程式碼保持一致。架構測試會檢查 001／003／004 組件圖中的每個組件都有對應檔案並匯出同名符號，改名卻不改圖，測試會失敗。這一步不放在 plan 階段做，因為程式碼還沒改名，提前改圖反而會讓測試先壞掉。
- **Alternatives considered**：檔名維持 `TeacherDashboard.tsx`，只改內容 → 名稱與用途不符，容易誤導日後的組員，否決。

## R9. 測試策略

- **Decision**：
  - 元件測試（Testing Library）：
    - `SideMenu`：開關、Esc、點遮罩、目前項目的 `aria-current`、焦點回到按鈕。
    - `TeacherLayout`：按鈕的 `aria-expanded`、點選項目後切換路由並收起選單。
    - `QuestionPager`：第一題與最後一題時按鈕停用、位置文字。
    - `QuestionOverview`：「⚠」標示與點選跳題。
  - `AnnotationPanel` 以 hook 加面板整合的方式測試，涵蓋 FR-014～FR-023 的每個情境，包括刪除時的三種分支、上下移動、步驟進行中切題、前往第 N 題。
  - 路由測試：老師開 `/teacher` 看到「搶答活動」標題；`/teacher/activity` 被導回；學生開 `/teacher/students` 被拒；`/dev` 顯示 404。
  - SC-002 以結構斷言驗證：標註區渲染的題目編輯區塊永遠只有 1 個，不受題數影響。jsdom 量不到實際高度，真實高度在 quickstart 手動確認。
  - `narrowScreen.test.tsx` 擴充：在 360px 寬度下渲染選單與總覽，檢查沒有固定寬度造成溢出的 class。
- **Rationale**：符合憲章原則 IV（正常＋邊界案例），並且讓每條 FR 都有自動化測試對應。
- **Alternatives considered**：用 Playwright 做 E2E → 專案沒有這套基礎設施，所以列為手動驗證，否決。
