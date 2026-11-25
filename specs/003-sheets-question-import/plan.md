# Implementation Plan: 學習單題目匯入（F3 Google 試算表串接＋F4 互動標註式匯入）

**Branch**: `003-sheets-question-import` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-sheets-question-import/spec.md`

**Note**: This template is filled in by the `$speckit-plan` command; its definition describes the execution workflow.

## Summary

老師以自己的 Google 帳號授權後（F3），貼上學習單連結，系統直接讀取雲端試算表，把分頁畫成格子；老師逐題點選題目格與作答格（單題與題組可混合、題數不限），預覽後確認匯入為目前唯一的題目集（F4）。系統不使用任何寫死的儲存格位置：確認匯入時把標註以老師看不到的 **developer metadata**（列錨點＋欄錨點）附在試算表上。這些標註會跟著列欄移動，寫回答案後也還在，下次匯入時自動帶回，F10 寫回時也用它找出作答格目前的位置。

技術做法：沿用 001 的 Express 5＋`node:sqlite`＋zod 4＋React 19＋Tailwind v4。Google OAuth（授權碼＋PKCE）與 Sheets API v4 以內建 `fetch` 自行封裝，不加新套件；token 以 AES-256-GCM 加密保存。標註規則放在 `@buzzer/shared`，前後端共用；標註草稿放在伺服器端，確認匯入前重新比對學習單。架構依 `./diagrams/003-*.puml`（憲章原則 VI），決策細節見 [research.md](research.md)。

## Technical Context

**Language/Version**: TypeScript 6（`strict: true`），Node.js ≥ 24（沿用 001）

**Primary Dependencies**:
- 後端：沿用 Express 5、zod 4、dotenv；Google 串接使用 Node 內建 `fetch`、`AbortSignal.timeout`、`crypto`（AES-256-GCM、PKCE、隨機值）。**不新增執行期套件**。
- 前端：沿用 React 19、react-router 7、Tailwind v4；格子元件自製（research R8）。
- 共用：`@buzzer/shared` 新增 `annotation.ts`。

**Storage**: SQLite（`node:sqlite`），migration version 3 新增 7 張表（[data-model.md](data-model.md)）；試算表上的標註存在 Google developer metadata（research R3）。

**Testing**: Vitest（shared、backend、frontend）；後端 supertest；Google 以 `FakeGoogle`（記憶體模擬，含列欄插入／刪除時 metadata 移動）與錄製回應的假 `fetch` 測試，不連線真實 Google（research R11）。

**Target Platform**: Node.js 伺服器；瀏覽器為近兩年主流手機、平板、桌機瀏覽器。

**Project Type**: Web application（frontend＋backend＋shared）

**Performance Goals**: 30 題學習單讀取到顯示格子 ≤ 5 秒（SC-003，Google 正常回應下）；每次 Google 呼叫 15 秒逾時；標註自動儲存防抖 800 ms。

**Constraints**: 不得寫死儲存格位置（FR-012）；試算表內容、格式、附註不得改變（SC-006）；token、授權碼、client secret 不得出現在回應或 log（SC-009）；375 px 頁面無水平捲動且可完成標註（FR-034、SC-010）；學習單使用範圍上限 500 列×52 欄。

**Scale/Scope**: 單一老師；題目集最多 200 題、每題 10 小題；13 個 API 端點（含 OAuth 回呼）；1 個新頁面、6 個新前端元件；5 張設計圖。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 檢查項目 | Phase 0 前 | Phase 1 後 | 依據 |
|------|----------|-----------|-----------|------|
| I. 輸入驗證 | 連結、分頁、標註文件、OAuth 回呼參數、GOOGLE_* 環境變數皆在進入點驗證；標註規則在伺服器端重新驗證 | ✅ 規劃 | ✅ [openapi.yaml](contracts/openapi.yaml) 定義每個端點 schema；`validateAnnotations` 規則表見 research R6、data-model §2.3 | R6、R7、R10 |
| II. 清楚錯誤訊息 | 沿用 001 錯誤格式；每種 Google 錯誤對應到說明原因與修正方式的訊息；不回傳 Google 錯誤原文或 token | ✅ 規劃 | ✅ 新錯誤碼表（openapi `ErrorResponse`）、Issue 皆含 message＋hint；OAuth 回呼只帶固定結果代碼 | R2、ui-routes |
| III. 機敏資料只放環境變數 | client ID／secret、加密金鑰只來自 `.env`；成組缺漏即停止；token 加密保存；log 遮罩 code／verifier | ✅ 規劃 | ✅ `.env.template` 將補上 GOOGLE_* 變數名稱（不含值）；Logger 遮罩鍵名擴充 | R1、R10 |
| IV. 正常＋邊界案例測試 | 每個 FR 有正常與邊界案例；驗證失敗與錯誤訊息皆有測試；不依賴真實憑證 | ✅ 規劃 | ✅ FakeGoogle、假 fetch、假時鐘策略已定 | R11 |
| V. 回報測試指令與結果 | `npm test` 單一指令，另提供分區指令 | ✅ 規劃 | ✅ [quickstart.md](quickstart.md) §4 | quickstart |
| VI. PlantUML 設計優先 | 組件圖、類別圖、3 張時序圖與 PNG 已產生；plan 以圖為藍圖；一致性測試涵蓋 003 | ✅ 5 張圖與 PNG 已產生 | ✅ 下方對照表逐一映射；`diagram-consistency.test.ts` 擴充為 001＋003 聯集 | R12 |

**Gate 結果**：全部通過，無需填寫 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/003-sheets-question-import/
├── plan.md              # 本文件
├── research.md          # Phase 0：技術決策
├── data-model.md        # Phase 1：資料表、共用型別、developer metadata 格式
├── quickstart.md        # Phase 1：設定、測試、手動驗證情境
├── contracts/
│   ├── openapi.yaml     # Phase 1：REST API 合約
│   └── ui-routes.md     # Phase 1：前端路由與畫面狀態
├── checklists/
│   └── requirements.md  # 規格品質檢查
└── tasks.md             # Phase 2（/speckit-tasks 產生）

diagrams/                # 設計藍圖（憲章原則 VI）
├── 003-component.puml / .png
├── 003-class.puml / .png
├── 003-sequence-connect.puml / .png
├── 003-sequence-import.puml / .png
└── 003-sequence-reimport.puml / .png
```

### Source Code (repository root)

```text
.env.template                          # 補上 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_TOKEN_ENCRYPTION_KEY、GOOGLE_OAUTH_REDIRECT_URI

shared/src/
├── annotation.ts                      # AnnotationRules：型別、parseSheetLink、validateAnnotations、autoNumber、A1 工具
└── index.ts                           # 匯出 annotation.ts
shared/tests/annotation.test.ts

backend/src/
├── config/env.ts                      # Config 擴充 google?: { clientId, clientSecret, encryptionKey, redirectUri }（成組規則）
├── lib/
│   ├── errors.ts                      # 新增錯誤碼（openapi ErrorResponse）
│   ├── logger.ts                      # 遮罩鍵名加入 code、verifier、key
│   └── tokenCipher.ts                 # TokenCipher
├── domain/
│   ├── questionTypes.ts               # GoogleConnection、OAuthState、ImportDraft、QuestionSet、ImportedQuestion、AnswerSlot、QuestionEvent、DraftStatus
│   ├── questionPorts.ts               # GoogleOAuthClient、SheetsGateway、5 個 repository 介面
│   └── annotationCodec.ts             # AnnotationCodec
├── integrations/google/
│   ├── googleOAuthClient.ts           # GoogleOAuthClient（fetch 實作）
│   ├── sheetsGateway.ts               # SheetsGateway（fetch 實作，錯誤對應 research R2）
│   └── googleHttp.ts                  # 共用：逾時、Google 錯誤 → AppError 對應
├── db/
│   ├── migrations.ts                  # version 3
│   ├── googleConnectionRepository.ts
│   ├── oauthStateRepository.ts
│   ├── importDraftRepository.ts
│   ├── questionSetRepository.ts
│   └── questionEventRepository.ts
├── services/
│   ├── googleAuthService.ts
│   ├── sheetsService.ts
│   ├── questionImportService.ts
│   └── questionSetService.ts
├── schemas/
│   ├── google.ts                      # oauth 回呼 query
│   └── questionImport.ts              # link、sheetId、AnnotationDocument、draftId
├── routes/
│   ├── googleRoutes.ts                # /api/google
│   ├── questionImportRoutes.ts        # /api/question-import（annotations 路由 body 上限 1 MB）
│   └── questionSetRoutes.ts           # /api/question-set
└── app.ts                             # 組裝上述元件（Google 未設定時 GoogleAuthService 回 GOOGLE_NOT_CONFIGURED）

backend/tests/
├── helpers/fakeGoogle.ts              # FakeGoogle：多份虛構試算表、metadata、insertRows／deleteColumns
├── fixtures/google/*.json             # 錄製格式的虛構回應
├── unit/                              # annotationCodec、tokenCipher、config.google、googleHttp 錯誤對應
├── integration/                       # google.oauth、questionImport.*、questionSet、questionAuth（學生 403）、questionNoSecrets
└── architecture/diagram-consistency.test.ts   # 擴充讀取 001＋003

frontend/src/
├── api/apiClient.ts                   # 新增 google／questionImport／questionSet 方法與型別
├── pages/
│   ├── TeacherDashboard.tsx           # 新增「題目管理」按鈕
│   └── QuestionManagePage.tsx         # /teacher/questions
├── questions/
│   ├── GoogleConnectionPanel.tsx
│   ├── SheetLinkForm.tsx
│   ├── SheetGrid.tsx
│   ├── AnnotationPanel.tsx
│   ├── ImportPreview.tsx
│   ├── QuestionSetPanel.tsx
│   └── useAnnotationDraft.ts          # 草稿狀態、防抖自動儲存、revision 衝突處理
└── main.tsx                           # 新增 /teacher/questions 路由
frontend/tests/                        # QuestionManagePage、SheetGrid、AnnotationPanel、ImportPreview、GoogleConnectionPanel
```

**Structure Decision**: 沿用 001 的分層（routes → middleware → services → repositories），新增「外部整合層」`backend/src/integrations/google/`，對應組件圖的同名 package；Google 的介面（ports）與資料型別放在 `domain/questionPorts.ts`、`domain/questionTypes.ts`，與 001 的 `ports.ts`、`types.ts` 分開，避免互相干擾。標註規則放在 `shared`，前後端共用一份實作。

## 設計圖對照表（憲章原則 VI）

### 組件圖 → 檔案（[003-component.puml](../../diagrams/003-component.puml)）

| 組件 | 檔案 | 組件 | 檔案 |
|------|------|------|------|
| StudentManagePage | `frontend/src/pages/StudentManagePage.tsx`（006 由 TeacherDashboard 改名） | GoogleRoutes | `backend/src/routes/googleRoutes.ts` |
| QuestionManagePage | `frontend/src/pages/QuestionManagePage.tsx` | QuestionImportRoutes | `backend/src/routes/questionImportRoutes.ts` |
| GoogleConnectionPanel | `frontend/src/questions/GoogleConnectionPanel.tsx` | QuestionSetRoutes | `backend/src/routes/questionSetRoutes.ts` |
| SheetLinkForm | `frontend/src/questions/SheetLinkForm.tsx` | RequireAuth / RequireRole | `backend/src/middleware/requireAuth.ts`、`backend/src/middleware/requireRole.ts`、`backend/src/middleware/validate.ts`、`backend/src/middleware/errorHandler.ts` |
| SheetGrid | `frontend/src/questions/SheetGrid.tsx` | GoogleAuthService | `backend/src/services/googleAuthService.ts` |
| AnnotationPanel | `frontend/src/questions/AnnotationPanel.tsx` | SheetsService | `backend/src/services/sheetsService.ts` |
| ImportPreview | `frontend/src/questions/ImportPreview.tsx` | QuestionImportService | `backend/src/services/questionImportService.ts` |
| QuestionSetPanel | `frontend/src/questions/QuestionSetPanel.tsx` | QuestionSetService | `backend/src/services/questionSetService.ts` |
| ApiClient | `frontend/src/api/apiClient.ts` | AnnotationCodec | `backend/src/domain/annotationCodec.ts` |
| AnnotationRules | `shared/src/annotation.ts` | TokenCipher | `backend/src/lib/tokenCipher.ts` |
| Config | `backend/src/config/env.ts` | GoogleOAuthClient | `backend/src/integrations/google/googleOAuthClient.ts` |
| Logger | `backend/src/lib/logger.ts` | SheetsGateway | `backend/src/integrations/google/sheetsGateway.ts` |
| 資料庫 | SQLite（`backend/src/lib/db.ts`） | GoogleConnectionRepository | `backend/src/db/googleConnectionRepository.ts` |
| .env | 根目錄 `.env`（範本 `.env.template`） | OAuthStateRepository | `backend/src/db/oauthStateRepository.ts` |
| ImportDraftRepository | `backend/src/db/importDraftRepository.ts` | QuestionSetRepository | `backend/src/db/questionSetRepository.ts` |
| QuestionEventRepository | `backend/src/db/questionEventRepository.ts` | | |

`AnnotationRules` 以 `export const AnnotationRules = { parseSheetLink, validateAnnotations, autoNumber }` 匯出（各函式亦個別匯出）。Google OAuth 與 Google Sheets API 為外部服務（組件圖的 cloud），不對應程式檔案。

### 類別圖 → 程式型別（[003-class.puml](../../diagrams/003-class.puml)）

| 類別圖元素 | 程式位置 |
|-----------|----------|
| `QuestionKind`、`SheetLink`、`GridSnapshot`、`ProtectedArea`（005 T063）、`AnnotationDocument`、`AnnotatedQuestion`、`AnnotatedPart`、`Issue`、`ValidationResult`、`QuestionSetView` | `shared/src/annotation.ts` |
| `DraftStatus`、`GoogleConnection`、`OAuthState`、`ImportDraft`、`QuestionSet`、`ImportedQuestion`、`AnswerSlot`、`QuestionEvent` | `backend/src/domain/questionTypes.ts`（純型別）；資料表見 [data-model.md](data-model.md) |
| `GoogleOAuthClient`、`SheetsGateway`、`GoogleConnectionRepository`、`OAuthStateRepository`、`ImportDraftRepository`、`QuestionSetRepository`、`QuestionEventRepository`（interface） | 介面定義於 `backend/src/domain/questionPorts.ts`；實作類別（同名）見組件對照表 |
| `GoogleAuthService`、`SheetsService`、`QuestionImportService`、`QuestionSetService`、`AnnotationCodec`、`TokenCipher` | 見組件對照表；公開方法名稱與類別圖相同 |

### 基礎設施檔案允許清單

下列檔案不是設計圖中的元素，而是組裝、啟動或支援用的基礎設施；其餘位於 `routes/`、`services/`、`db/`、`middleware/`、`integrations/google/` 的檔案必須出現在 001 或本 plan 的對照表。

| 檔案 | 角色 |
|------|------|
| `backend/src/integrations/google/googleHttp.ts` | GoogleOAuthClient 與 SheetsGateway 共用的逾時與錯誤對應 |
| `backend/src/domain/questionTypes.ts`、`backend/src/domain/questionPorts.ts` | 類別圖型別與介面的程式定義 |
| `backend/src/db/migrations.ts` | version 3 資料表（對應組件圖「資料庫」的結構） |
| `backend/src/schemas/*.ts` | `Validate` 使用的 zod schema（對應 [openapi.yaml](contracts/openapi.yaml)） |
| `frontend/src/questions/useAnnotationDraft.ts` | 標註頁的狀態與自動儲存 hook（AnnotationPanel、SheetGrid 的實作細節） |
| `frontend/src/main.tsx` | 新增 `/teacher/questions` 路由 |

### 時序圖 → 程式流程

| 時序圖 | 端點（[openapi.yaml](contracts/openapi.yaml)） | 主要測試 |
|--------|------|----------|
| [003-sequence-connect](../../diagrams/003-sequence-connect.puml) | `POST /api/google/oauth/start`、`GET /api/google/oauth/callback`、`DELETE /api/google/connection`、`GET /api/google/status` | `tests/integration/google.oauth.test.ts` |
| [003-sequence-import](../../diagrams/003-sequence-import.puml) | `POST /api/question-import/drafts`、`PUT …/annotations`、`POST …/preview`、`POST …/confirm`、`DELETE …/{id}`、`GET …/current` | `tests/integration/questionImport.read.test.ts`、`questionImport.annotate.test.ts`、`questionImport.confirm.test.ts` |
| [003-sequence-reimport](../../diagrams/003-sequence-reimport.puml) | `POST /api/question-set/reimport`、`GET/DELETE /api/question-set`；`SheetsService.locateAnswerCells`、`writeCells` | `tests/integration/questionSet.test.ts`、`tests/unit/sheetsService.f10.test.ts` |

## 實作要點（依設計圖）

1. **Config**：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_TOKEN_ENCRYPTION_KEY` 全空 → `config.google = null`；部分有值或格式錯誤 → `ConfigError`（research R10）。
2. **GoogleAuthService**：`config.google` 為 null 時所有方法丟 `GOOGLE_NOT_CONFIGURED`（`getStatus` 例外，回 `configured: false`）。`getAccessToken` 處理到期前 60 秒更新與 `invalid_grant`（research R1）。
3. **SheetsService** 是 F3 對外介面（roadmap 的 `readSheet`／`writeCells`）：負責取得 token、401 時更新後重試一次、組合 SheetsGateway 呼叫與 AnnotationCodec，F10 只依賴它。
4. **QuestionImportService.confirm** 的順序固定為：完整性驗證 → 重新讀取並比對（R4）→ `replaceAnnotations`（單一 batchUpdate）→ DB 交易（取代題目集、草稿 CONFIRMED、事件）。Google 寫入成功但 DB 交易失敗時，試算表上的標註已是新內容，可由下次重新匯入帶回，不影響正確性；記錄 error log。
5. **路由**：`/google/oauth/callback` 不掛 `requireAuth`（以 `oauth_states.session_id` 與 cookie 中的 session 比對），結果一律 302 導回前端；其餘端點 `requireAuth → requireRole('TEACHER') → validate`。`PUT …/annotations` 使用獨立的 `express.json({ limit: '1mb' })`。
6. **前端**：`useAnnotationDraft` 持有標註文件、套用 `autoNumber`、本地 `validateAnnotations`、800 ms 防抖 `PUT`；`DRAFT_REVISION_CONFLICT` 時提示「此學習單已在其他視窗修改，請重新載入」並重新取得草稿；`DRAFT_EXPIRED` 時提示重新讀取。

## 錯誤情境與訊息（憲章：開發流程與品質關卡）

所有錯誤皆使用 001 的 `ErrorResponse` 格式（`code`、`message`、`field`、`hint`、`details`）。訊息不含 token、Google 錯誤原文或內部堆疊（憲章原則 II）。OAuth 回呼的結果訊息見 [contracts/ui-routes.md](contracts/ui-routes.md)「查詢參數 `?google=`」。

| 錯誤碼 | HTTP | 情境 | message | hint |
|---|---|---|---|---|
| `VALIDATION_ERROR` | 400 | 請求格式不符 schema（例如超過 200 題、`key` 格式錯誤、CellRef 格式錯誤） | 依欄位說明，例如「題目數不可超過 200 題」 | 依欄位說明如何修正 |
| `SHEET_LINK_INVALID` | 400 | 連結空白、超過 2,000 字元、不是 Google 試算表網址（`field: link`） | 請貼上 Google 試算表連結 | 例如 https://docs.google.com/spreadsheets/d/… |
| `UNAUTHENTICATED` | 401 | 未登入（沿用 001） | 請先登入 | 請重新登入後再試一次 |
| `FORBIDDEN` | 403 | 學生呼叫本功能（沿用 001 的 RequireRole） | 此功能僅限老師使用 | — |
| `SHEET_FORBIDDEN` | 403 | 讀取時 Google 回 403 | 你連結的 Google 帳號沒有這份試算表的檢視權限 | 請確認連結，或請擁有者將試算表分享給你 |
| `SHEET_NO_EDIT_PERMISSION` | 403 | 確認匯入或寫入時 Google 回 403 | 你連結的 Google 帳號沒有這份試算表的編輯權限，無法保存標註 | 請擁有者將你設為「編輯者」後再確認匯入 |
| `NOT_FOUND` | 404 | 草稿不存在或不屬於自己；重新匯入時沒有題目集 | 找不到這份標註草稿／目前沒有題目集可重新匯入 | 請重新讀取學習單／請先貼上學習單連結匯入 |
| `SHEET_NOT_FOUND` | 404 | Google 回 404 | 找不到這份試算表 | 請確認連結是否正確 |
| `SHEET_TAB_NOT_FOUND` | 404 | 指定的分頁不存在（`details.sheets` 附可選分頁） | 找不到指定的分頁 | 請從列出的分頁中選擇 |
| `GOOGLE_NOT_CONNECTED` | 409 | 尚未連結 Google 帳號 | 請先連結 Google 帳號，才能讀取學習單 | 請按「連結 Google 帳號」 |
| `GOOGLE_AUTH_EXPIRED` | 409 | refresh 失敗（`invalid_grant`）；系統已刪除連結 | Google 帳號授權已失效 | 請重新連結 Google 帳號 |
| `SHEET_CHANGED` | 409 | 確認匯入前比對發現學習單被修改 | 學習單在標註期間被修改 | 請重新讀取並確認標註 |
| `DRAFT_REVISION_CONFLICT` | 409 | 送出的 revision 與伺服器不同（`details.revision`） | 此學習單已在其他視窗修改 | 請重新載入以取得最新的標註 |
| `DRAFT_EXPIRED` | 410 | 草稿超過 30 分鐘未儲存 | 標註進度已超過 30 分鐘未儲存而失效 | 請重新讀取學習單 |
| `SHEET_EMPTY` | 422 | 分頁沒有任何內容 | 這個分頁是空的 | 請選擇其他分頁 |
| `SHEET_TOO_LARGE` | 422 | 使用範圍超過 500 列或 52 欄（`details.rowCount`、`details.columnCount`） | 這個分頁的使用範圍為 R 列 × C 欄，超過上限 500 列 × 52 欄 | 請把學習單放在範圍較小的分頁 |
| `SHEET_NOT_NATIVE` | 422 | Google 回 400 `FAILED_PRECONDITION`：檔案是上傳到雲端硬碟的 Excel（.xlsx）等非原生試算表（手動驗證時發現） | 這個檔案不是 Google 試算表格式（可能是上傳的 Excel 檔） | 請在 Google 試算表中選「檔案 → 儲存為 Google 試算表」，再貼上新檔案的連結 |
| `ANNOTATION_INVALID` | 422 | 預覽或確認時仍有未完成或不合規的標註（`details.issues` ≤ 50、`details.totalIssues`） | 標註尚未完成或有錯誤（共 N 項） | 請依清單逐項修正後再預覽 |
| `GOOGLE_NOT_CONFIGURED` | 503 | 系統未設定 GOOGLE_* | 系統尚未設定 Google 試算表串接 | 請聯絡系統管理者 |
| `GOOGLE_RATE_LIMITED` | 503 | Google 回 429 | 暫時無法連線到 Google 試算表 | Google 使用量暫時超過上限，請稍後再試 |
| `GOOGLE_UNAVAILABLE` | 503 | Google 5xx、逾時（15 秒）或網路錯誤 | 暫時無法連線到 Google 試算表 | 請稍後再試 |

標註中的個別問題（`Issue`）的 message／hint 依 [data-model.md](data-model.md) §2.3 的 `IssueCode` 產生，例如 `MISSING_ANSWER_CELL`：「第 4 題缺少作答格」／「請點選該題的作答格」。

## 實作階段的一致性驗證（憲章原則 VI）

`/speckit-implement` 完成後必須：

1. 擴充 `backend/tests/architecture/diagram-consistency.test.ts`：同時解析 001 與 003 的 plan 與圖，組件／類別對照取聯集；「無多餘檔案」的檢查目錄加入 `integrations/google`；`shared/src/annotation.ts` 的型別亦列入檢查。執行 `npm test -w backend` 須通過。
2. 依三張 003 時序圖逐步比對實際程式流程（呼叫順序、錯誤碼、分支），於完成回報列出結果。
3. 若實作需偏離設計，先修改 `.puml`、執行 `java -jar plantuml.jar "./diagrams/*.puml"` 重新產生 PNG、更新本對照表，再修改程式碼。

## Post-Design Constitution Re-check

Phase 1 產出（research、data-model、contracts、quickstart、5 張設計圖）完成後重新檢查上方表格：六項原則皆維持 ✅。設計過程中確認的取捨：

| 取捨 | 理由 | 記錄於 |
|---|---|---|
| developer metadata 以「列錨點＋欄錨點」表示格子，而非每個標註一筆 | metadata 無法附在單一格，且每個位置有字元上限 | research R3 |
| 確認匯入比對與寫入之間有極短的競態視窗 | Sheets API 沒有 batchUpdate 的樂觀鎖；影響可由重新匯入發現 | research R4、quickstart §6 |
| 不新增 Google 套件 | 只用到少數端點，自行封裝較易測試且相依較少 | research R1 |
| 草稿放伺服器端 | 所見即所得、跨裝置續作、伺服器重新驗證 | research R5 |

## Complexity Tracking

無違反憲章之處，不需填寫。
