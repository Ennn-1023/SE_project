---

description: "Task list for 003-sheets-question-import（F3 Google 試算表串接＋F4 互動標註式匯入）"
---

# Tasks: 學習單題目匯入（F3 Google 試算表串接＋F4 互動標註式匯入）

**Input**: Design documents from `/specs/003-sheets-question-import/`

**Prerequisites**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、[data-model.md](data-model.md)、[contracts/openapi.yaml](contracts/openapi.yaml)、[contracts/ui-routes.md](contracts/ui-routes.md)、[quickstart.md](quickstart.md)、`diagrams/003-*.puml`

**Tests**: 憲章原則 IV 規定每個功能 MUST 有正常案例與邊界案例測試，因此每個 user story 都包含測試任務；測試先寫並確認失敗，再實作。所有 Google 互動使用 `FakeGoogle` 或假 `fetch`，不連線真實 Google、不使用真實憑證。

**Organization**: 依 spec.md 的 user story 分組。US1～US3 皆為 P1，且依序相依（讀取 → 標註 → 匯入），三者合起來才是可展示的 MVP。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔案、不依賴未完成的任務）
- **[Story]**: 對應 spec.md 的 user story（US1～US5）
- 路徑：`shared/`、`backend/`、`frontend/`（npm workspaces，見 plan.md）

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 環境變數與目錄骨架

- [X] T001 在 `.env.template` 的「選填」區新增 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_TOKEN_ENCRYPTION_KEY`、`GOOGLE_OAUTH_REDIRECT_URI`（只有名稱與規則說明、不含值；註明前三者須全填或全空，產生金鑰的指令見 quickstart.md §2）
- [X] T002 [P] 建立目錄 `backend/src/integrations/google/`、`backend/tests/fixtures/google/`、`frontend/src/questions/`（各放一個 `.gitkeep`，待後續任務以實際檔案取代）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有 user story 共用的型別、設定、錯誤碼、資料表與 Google 替身

**⚠️ CRITICAL**: 此階段完成前不得開始任何 user story

### 測試（先寫、須先失敗）

- [X] T003 [P] 在 `shared/tests/annotation.test.ts` 撰寫 A1 工具與 `parseSheetLink` 測試：正常（`/edit?gid=1028924918#gid=1028924918`、`?usp=sharing`、`/u/1/d/{id}`、無 gid）與邊界（空字串、2,001 字元、http、非 docs.google.com、`/document/d/`、id 少於 20 字元、gid 非數字），對應 research R7、FR-008
- [X] T004 [P] 在 `backend/tests/unit/config.google.test.ts` 撰寫 Config 成組規則測試：三個 GOOGLE_* 全空 → `google = null`；只填一或兩個 → `ConfigError` 只列變數名稱不含值；金鑰非 base64 或解碼後非 32 bytes、client ID 不以 `.apps.googleusercontent.com` 結尾、redirect URI 非 http(s) → `ConfigError`（research R10）
- [X] T005 [P] 在 `backend/tests/unit/tokenCipher.test.ts` 撰寫 `TokenCipher` 測試：加解密往返、同一明文兩次密文不同（隨機 IV）、竄改 ciphertext／tag 時解密失敗、錯誤金鑰解密失敗（research R1）
- [X] T006 [P] 在 `backend/tests/unit/googleHttp.test.ts` 撰寫錯誤對應測試：401／403／404／429／5xx／網路錯誤／15 秒逾時（假計時器）分別對應 research R2 表格中的錯誤碼，且 AppError 訊息不含 Google 回應原文與 token
- [X] T007 [P] 在 `backend/tests/unit/logger.test.ts` 追加測試：鍵名 `code`、`codeVerifier`、`encryptionKey`、`accessToken`、`refreshToken` 的值被遮罩為 `[REDACTED]`

### 實作

- [X] T008 [P] 在 `shared/src/annotation.ts` 定義共用型別（`QuestionKind`、`CellRef`、`SheetLink`、`GridSnapshot`、`GridCell`、`MergeRange`、`AnnotationDocument`、`AnnotatedQuestion`、`AnnotatedPart`、`Issue`、`IssueCode`、`ValidationResult`、`QuestionSetView`、`SheetSource`、`SheetTab`），欄位與限制依 data-model.md §2.1 `GridSnapshot.rowCount`、`GridSnapshot.columnCount`、§2.2 `AnnotatedQuestion.key`、`AnnotatedQuestion.label`、`AnnotatedQuestion.labelManual`、`AnnotatedQuestion.kind`、`AnnotatedQuestion.parts`、`AnnotatedQuestion.stemCell`、`AnnotatedPart.questionCell`、`AnnotatedPart.answerCell`、`CellRef`、§2.3 `IssueCode`、§2.4 `QuestionSetView`；並在 `shared/src/index.ts` 匯出
- [X] T009 在 `shared/src/annotation.ts` 實作 A1 工具（`colToLetters`、`lettersToCol`、`parseCellRef`、`normalizeToMergeTopLeft(ref, merges)`、`isInSnapshot(ref, snapshot)`）與 `parseSheetLink(url)`（research R7，回傳 `SheetLink` 或含 message／hint 的錯誤），使 T003 通過（依賴 T008）
- [X] T010 [P] 在 `backend/src/lib/errors.ts` 新增錯誤碼與 HTTP 狀態：`GOOGLE_NOT_CONFIGURED`(503)、`GOOGLE_NOT_CONNECTED`(409)、`GOOGLE_AUTH_EXPIRED`(409)、`GOOGLE_RATE_LIMITED`(503)、`GOOGLE_UNAVAILABLE`(503)、`SHEET_LINK_INVALID`(400)、`SHEET_NOT_FOUND`(404)、`SHEET_FORBIDDEN`(403)、`SHEET_NO_EDIT_PERMISSION`(403)、`SHEET_TAB_NOT_FOUND`(404)、`SHEET_EMPTY`(422)、`SHEET_TOO_LARGE`(422)、`SHEET_CHANGED`(409)、`ANNOTATION_INVALID`(422)、`DRAFT_EXPIRED`(410)、`DRAFT_REVISION_CONFLICT`(409)（contracts/openapi.yaml `ErrorResponse`），並建立各錯誤碼的 message／hint 常數，文字依 plan.md「錯誤情境與訊息」表；同步更新 `shared/src/errorCodes.ts`（若前端用到）
- [X] T011 [P] 在 `backend/src/config/env.ts` 擴充 `Config.google: { clientId, clientSecret, encryptionKey: Buffer, redirectUri } | null` 與成組驗證（research R10；redirectUri 預設 `{CLIENT_ORIGIN}/api/google/oauth/callback`），使 T004 通過
- [X] T012 [P] 在 `backend/src/lib/logger.ts` 的 `SENSITIVE_KEY` 加入 `code`（完整鍵名比對，避免誤遮 `errorCode` 等）、`verifier`、`key`，使 T007 通過且既有 logger 測試仍通過
- [X] T013 [P] 在 `backend/src/lib/tokenCipher.ts` 實作 `TokenCipher`（`encrypt`、`decrypt`；AES-256-GCM、12-byte IV、格式 `iv.tag.ciphertext` base64，依 data-model.md §1.1 `google_connections.refresh_token_enc`），使 T005 通過
- [X] T014 在 `backend/src/db/migrations.ts` 新增 version 3，建立 7 張表與約束，逐欄依 data-model.md：
  - §1.1 `google_connections.user_id`、`google_connections.google_email`、`google_connections.refresh_token_enc`、`google_connections.access_token_enc`、`google_connections.access_token_expires_at`、`google_connections.scopes`、`google_connections.connected_at`、`google_connections.last_used_at`
  - §1.2 `oauth_states.state`、`oauth_states.user_id`、`oauth_states.session_id`、`oauth_states.code_verifier_enc`、`oauth_states.created_at`、`oauth_states.expires_at`
  - §1.3 `import_drafts.id`、`import_drafts.user_id`（含 `UNIQUE (user_id) WHERE status='OPEN'` 部分索引）、`import_drafts.status`、`import_drafts.spreadsheet_id`、`import_drafts.spreadsheet_title`、`import_drafts.sheet_id`、`import_drafts.sheet_title`、`import_drafts.source_url`、`import_drafts.sheets_json`、`import_drafts.snapshot_json`、`import_drafts.metadata_fingerprint`、`import_drafts.annotations_json`、`import_drafts.restored_count`、`import_drafts.revision`、`import_drafts.created_at`、`import_drafts.updated_at`、`import_drafts.expires_at`
  - §1.4 `question_sets.id`、`question_sets.spreadsheet_id`、`question_sets.spreadsheet_title`、`question_sets.sheet_id`、`question_sets.sheet_title`、`question_sets.source_url`、`question_sets.question_count`、`question_sets.slot_count`、`question_sets.imported_at`、`question_sets.imported_by`、`question_sets.draft_id`
  - §1.5 `question_set_questions.id`、`question_set_questions.question_set_id`、`question_set_questions.position`、`question_set_questions.question_key`、`question_set_questions.label`、`question_set_questions.kind`、`question_set_questions.stem_text`、`question_set_questions.stem_cell`
  - §1.6 `answer_slots.id`、`answer_slots.question_id`、`answer_slots.part_index`、`answer_slots.part_label`、`answer_slots.question_text`、`answer_slots.question_cell`、`answer_slots.answer_cell`、`answer_slots.answer_had_content`
  - §1.7 `question_events.id`、`question_events.at`、`question_events.actor_user_id`、`question_events.type`、`question_events.spreadsheet_id`、`question_events.sheet_title`、`question_events.question_count`
  
  並在 `backend/tests/unit/migrations.test.ts`（若無則新建）驗證 version 3 冪等、CHECK／UNIQUE 拒絕不合法值（例如 `question_sets.id = 2`、`question_events.type` 非五值之一、同一老師兩筆 OPEN 草稿）
- [X] T015 [P] 在 `backend/src/domain/questionTypes.ts` 定義實體型別 `DraftStatus`、`GoogleConnection`、`OAuthState`、`ImportDraft`、`QuestionSet`、`ImportedQuestion`、`AnswerSlot`、`QuestionEvent`、`QuestionEventType`（屬性名稱與 `diagrams/003-class.puml` 完全一致；欄位對應 data-model.md §1.1～§1.7）
- [X] T016 [P] 在 `backend/src/domain/questionPorts.ts` 定義介面 `GoogleOAuthClient`、`SheetsGateway`、`GoogleConnectionRepository`、`OAuthStateRepository`、`ImportDraftRepository`、`QuestionSetRepository`、`QuestionEventRepository`，方法名稱與 `diagrams/003-class.puml` 完全一致，並定義 `TokenSet`、`SpreadsheetInfo`、`UsedRange`、`MetadataEntry`、`SheetData`、`SlotLocation`、`CellUpdate` 型別
- [X] T017 在 `backend/src/integrations/google/googleHttp.ts` 實作共用的 `googleFetch(url, init)`（`AbortSignal.timeout(15000)`、JSON 解析）與 `mapGoogleError(status, phase: 'read'|'write')`（research R2 表格；讀取 403 → `SHEET_FORBIDDEN`、寫入 403 → `SHEET_NO_EDIT_PERMISSION`；log 只記遮罩後摘要），使 T006 通過（依賴 T010）
- [X] T018 在 `backend/tests/helpers/fakeGoogle.ts` 實作 `FakeGoogle`（同時實作 `GoogleOAuthClient` 與 `SheetsGateway` 介面）：保存多份虛構試算表（格子、合併、隱藏列欄、分頁）、模擬授權（可設定使用者拒絕、scope 不足、`invalid_grant`）、developer metadata 的建立／刪除／搜尋，並提供 `insertRows`、`deleteRows`、`insertColumns`、`deleteColumns`、`setCell`、`setPermission('view'|'edit'|'none')`、`failNext(status)`；列欄插入／刪除時依 Google 規則移動或刪除 metadata 與合併範圍（research R3、R11）（依賴 T016）
- [X] T019 [P] 在 `backend/tests/fixtures/google/` 建立兩份虛構範例學習單的資料（`single-sheet.ts`：6 題單題版面；`group-sheet.ts`：4 題、第 1、2 題各 2 小題的版面；版面依 spec.md「範例學習單」，題目文字為虛構內容）供 FakeGoogle 載入；另建立 SC-004 要求的 5 種變化版面 `variants.ts`：只有 1 題、50 題、單題與題組（含共同題幹）混合、作答欄在題目欄左側、作答格為合併格，以及含 3 個分頁的試算表
- [X] T020 [P] 在 `frontend/src/api/apiClient.ts` 新增型別（從 `@buzzer/shared` 匯入 `AnnotationDocument`、`ValidationResult`、`QuestionSetView`、`GridSnapshot`）與方法：`getGoogleStatus`、`startGoogleAuth`、`disconnectGoogle`、`createDraft`、`getCurrentDraft`、`saveAnnotations`、`previewImport`、`confirmImport`、`cancelDraft`、`getQuestionSet`、`clearQuestionSet`、`reimportQuestionSet`（路徑與回應依 contracts/openapi.yaml），並在 `frontend/tests/questionApi.test.ts` 撰寫至少一個正常與一個錯誤（`ANNOTATION_INVALID` 帶 details）案例

**Checkpoint**: 型別、設定、錯誤碼、資料表、Google 替身就緒

---

## Phase 3: User Story 1 - 老師連結 Google 帳號並讀取學習單 (Priority: P1) 🎯 MVP 第 1 段

**Goal**: 老師可連結／中斷 Google 帳號；貼上連結後系統讀取分頁並顯示與試算表相同排列的格子（建立標註草稿）。

**Independent Test**: 連結 Google 帳號後貼上單題範例連結，畫面顯示「學習單」分頁格子，C5～F5 呈現為一個合併格並顯示第 1 題文字；系統尚未保存任何題目（spec US1）。

### Tests for User Story 1 ⚠️

- [X] T021 [P] [US1] 在 `backend/tests/unit/googleOAuthClient.test.ts` 以假 `fetch` 測試 `GoogleOAuthClient`：授權網址含 `access_type=offline`、`prompt=consent`、`code_challenge_method=S256`、`state`、三個 scope；`exchangeCode`／`refresh`／`revoke`／`fetchEmail` 的請求內容；`invalid_grant` 轉為 `GOOGLE_AUTH_EXPIRED`
- [X] T022 [P] [US1] 在 `backend/tests/unit/sheetsGateway.test.ts` 以 `backend/tests/fixtures/google/*.json`（虛構回應）測試 `SheetsGateway`：`getSpreadsheet`／`getUsedRange`／`getGrid` 的網址與 `fields` 遮罩、分頁標題含空白與中文時的 range 跳脫、`formattedValue`／`errorValue`／合併／隱藏列欄轉為 `GridSnapshot`、`searchMetadata` 的 dataFilters
- [X] T023 [P] [US1] 在 `backend/tests/integration/google.oauth.test.ts` 撰寫：未設定 GOOGLE_* 時 `GET /api/google/status` 回 `configured:false`、start 回 503；start 回 `authUrl` 且建立 state；回呼成功 → 302 `?google=connected` 並保存加密 token；使用者取消 → `denied`；scope 不足 → `scope_missing` 且不保存；state 不存在、過期（假時鐘 +11 分鐘）、session 不符、重複使用 → `state_invalid`；交換失敗 → `error`；`DELETE /api/google/connection` 呼叫 revoke（revoke 失敗仍回 204）並刪除連結、題目集不受影響；學生呼叫 start／status／disconnect 回 403「權限不足」
- [X] T024 [P] [US1] 在 `backend/tests/integration/questionImport.read.test.ts` 撰寫 `POST /api/question-import/drafts`：單題範例 → 201、`grid` 含合併 `C5:F5`、`annotations.questions` 為空、`restoredCount` 0；連結含 gid 時選該分頁、`sheetId` 參數優先；無 gid 預設第一個分頁並回 `sheets` 清單；錯誤情境：連結不合法（400 `SHEET_LINK_INVALID`，不呼叫 FakeGoogle）、未連結（409）、授權失效（409 `GOOGLE_AUTH_EXPIRED` 且連結被刪除）；FR-004 成功路徑：以假時鐘讓 access token 剩 30 秒到期，讀取仍回 201，FakeGoogle 收到一次 refresh，資料庫的 `google_connections.access_token_enc`／`access_token_expires_at` 已更新，且回應中沒有任何需要老師重新連結的提示；無權限（403 `SHEET_FORBIDDEN`）、不存在（404）、分頁不存在（404，`details.sheets`）、空白分頁（422 `SHEET_EMPTY`）、501 列或 53 欄（422 `SHEET_TOO_LARGE`）、429／逾時（503）；建立第二份草稿時第一份變 CANCELLED；SC-003：FakeGoogle 每次呼叫加入 500 ms 模擬延遲、讀取 30 題學習單，`POST /drafts` 在 5 秒內回應（以實際經過時間斷言）；學生 403
- [X] T025 [P] [US1] 在 `frontend/tests/GoogleConnectionPanel.test.tsx` 撰寫：未設定、未連結、已連結（顯示 email）三種狀態；`?google=` 五種結果訊息（contracts/ui-routes.md）顯示後移除查詢參數；中斷連結需確認
- [X] T026 [P] [US1] 在 `frontend/tests/SheetGrid.test.tsx` 撰寫：欄列標示 A、B…、1、2…；合併格以單一格呈現；隱藏列欄淡色；點選合併範圍內任一格回呼左上角 ref；縮放 50%～200% 五段，≥100% 時格子 ≥ 44px（檢查 CSS 變數）
- [X] T027 [P] [US1] 在 `frontend/tests/QuestionManagePage.test.tsx` 撰寫讀取流程：前端以 `parseSheetLink` 擋下非試算表連結且不呼叫 API；成功後顯示格子；後端錯誤（403、404、`SHEET_TAB_NOT_FOUND` 附分頁選單）顯示訊息與修正方式；有多個分頁時可切換分頁重新讀取

### Implementation for User Story 1

- [X] T028 [P] [US1] 在 `backend/src/integrations/google/googleOAuthClient.ts` 實作 `class GoogleOAuthClient`（fetch 實作 `buildAuthUrl`、`exchangeCode`、`refresh`、`revoke`、`fetchEmail`；使用 `googleHttp.ts`；scope 見 research R1），使 T021 通過
- [X] T029 [P] [US1] 在 `backend/src/integrations/google/sheetsGateway.ts` 實作 `class SheetsGateway`（`getSpreadsheet`、`getUsedRange`、`getGrid`、`searchMetadata`；`batchUpdate`、`updateValues` 先實作請求組裝，於 US3／US5 補測試；回應轉換依 data-model.md §2.1 `GridSnapshot`），使 T022 通過
- [X] T030 [P] [US1] 在 `backend/src/db/googleConnectionRepository.ts` 實作 `class GoogleConnectionRepository`（`findByUser`、`upsert`、`updateAccessToken`、`delete`；欄位依 data-model.md §1.1 `google_connections.google_email`、`google_connections.scopes`、`google_connections.access_token_expires_at`）
- [X] T031 [P] [US1] 在 `backend/src/db/oauthStateRepository.ts` 實作 `class OAuthStateRepository`（`create`、`take`（查詢並刪除，單次使用）、`deleteExpired`；依 data-model.md §1.2 `oauth_states.state`、`oauth_states.expires_at`、`oauth_states.session_id`、`oauth_states.code_verifier_enc`）
- [X] T032 [P] [US1] 在 `backend/src/db/questionEventRepository.ts` 實作 `class QuestionEventRepository`（`record`；依 data-model.md §1.7 `question_events.at`、`question_events.actor_user_id`、`question_events.type`、`question_events.spreadsheet_id`、`question_events.sheet_title`、`question_events.question_count`；不寫入 token 或學習單內容）
- [X] T033 [P] [US1] 在 `backend/src/db/importDraftRepository.ts` 實作 `class ImportDraftRepository`（`create`（同交易內把該使用者既有 OPEN 草稿改為 CANCELLED）、`findById`、`findOpenByUser`、`updateAnnotations`（`WHERE revision = ?` 樂觀鎖，回傳是否成功）、`markConfirmed`、`markCancelled`；依 data-model.md §1.3 `import_drafts.status`、`import_drafts.revision`、`import_drafts.expires_at`、`import_drafts.user_id`）
- [X] T034 [US1] 在 `backend/src/services/googleAuthService.ts` 實作 `GoogleAuthService`（`getStatus`、`startAuthorization`（PKCE S256、32 bytes state、10 分鐘）、`handleCallback`（state 單次使用、session 比對、`access_denied`、scope 檢查、email、加密保存、事件 `GOOGLE_CONNECTED`）、`disconnect`（revoke 失敗只記遮罩 log）、`getAccessToken`（剩餘 < 60 秒即 refresh、`invalid_grant` 刪除連結並丟 `GOOGLE_AUTH_EXPIRED`、更新 data-model.md §1.1 `google_connections.last_used_at`））；連結時寫入 data-model.md §1.1 `google_connections.connected_at`；`config.google` 為 null 時除 `getStatus` 外丟 `GOOGLE_NOT_CONFIGURED`（依 diagrams/003-sequence-connect.puml；依賴 T028、T030～T032）
- [X] T035 [US1] 在 `backend/src/services/sheetsService.ts` 實作 `SheetsService.readSheet`（取得 token → getSpreadsheet → 依 sheetId／gid／第一個分頁選分頁，不存在丟 `SHEET_TAB_NOT_FOUND` 附清單 → getUsedRange 判斷 `SHEET_EMPTY`／`SHEET_TOO_LARGE`（data-model.md §2.1 `GridSnapshot.rowCount`、`GridSnapshot.columnCount` 上限）→ getGrid → searchMetadata；Google 回 401 時 refresh 後重試一次）；其餘三個公開方法先以 `throw new Error('not implemented')` 佔位並保留類別圖簽章（依賴 T029、T034）
- [X] T036 [US1] 在 `backend/src/services/questionImportService.ts` 實作 `createDraft`（`parseSheetLink` → `readSheet` → 建立 `ImportDraft`：`annotations` 空文件、`restoredCount` 0、`metadataFingerprint`、`expires_at` = now + 30 分鐘；依 data-model.md §1.3 `import_drafts.source_url`、`import_drafts.spreadsheet_id`、`import_drafts.sheet_id`、`import_drafts.snapshot_json`）與 `getCurrentDraft`（過期回 null）、`cancel`；其餘公開方法依類別圖簽章先佔位（依賴 T033、T035）
- [X] T037 [P] [US1] 在 `backend/src/schemas/google.ts` 定義回呼 query schema（`state` ≤ 200、`code` ≤ 2,000、`error` ≤ 200、`scope` ≤ 2,000，皆選填字串）；在 `backend/src/schemas/questionImport.ts` 定義 `createDraftBody`（`link` 1–2,000 字元、`sheetId` 非負整數選填、`additionalProperties: false`）與 `draftIdParams`（UUID）
- [X] T038 [US1] 在 `backend/src/routes/googleRoutes.ts` 實作 `googleRoutes`：`GET /status`、`POST /oauth/start`、`DELETE /connection`（`requireAuth → requireRole('TEACHER')`）、`GET /oauth/callback`（不掛 requireAuth；以 cookie session 比對；一律 302 到 `/teacher/questions?google=<result>`，不帶 token 或 Google 錯誤原文）（依賴 T034、T037）
- [X] T039 [US1] 在 `backend/src/routes/questionImportRoutes.ts` 實作 `POST /drafts`（201）、`GET /drafts/current`、`DELETE /drafts/:draftId`（`requireAuth → requireRole('TEACHER') → validate`）（依賴 T036、T037）
- [X] T040 [US1] 在 `backend/src/app.ts` 的 `createContainer` 組裝 `TokenCipher`、`GoogleOAuthClient`、`SheetsGateway`、5 個 repository、`GoogleAuthService`、`SheetsService`、`QuestionImportService`（`AppDeps` 新增選填 `google?: { oauth: GoogleOAuthClient; sheets: SheetsGateway }` 供測試注入 FakeGoogle），並掛載 `/api/google`、`/api/question-import`；更新 `backend/tests/helpers/testApp.ts` 支援注入 FakeGoogle 與假的 GOOGLE_* 設定，使 T023、T024 通過
- [X] T041 [P] [US1] 在 `frontend/src/questions/GoogleConnectionPanel.tsx` 實作 `GoogleConnectionPanel`（狀態、連結按鈕 → `startGoogleAuth` 後 `window.location.assign`、中斷連結確認、`?google=` 結果訊息與 `history.replaceState`），使 T025 通過
- [X] T042 [P] [US1] 在 `frontend/src/questions/SheetLinkForm.tsx` 實作 `SheetLinkForm`（輸入連結、前端 `parseSheetLink` 驗證、分頁選單、未連結時停用送出並顯示「請先連結 Google 帳號，才能讀取學習單」）
- [X] T043 [P] [US1] 在 `frontend/src/questions/SheetGrid.tsx` 實作 `SheetGrid`（CSS Grid、合併格 span、隱藏列欄淡色、欄列標頭、縮放五段與 `--cell-size` 變數、點選回傳左上角 ref、自身區塊捲動；research R8），使 T026 通過
- [X] T044 [US1] 在 `frontend/src/pages/QuestionManagePage.tsx` 實作 `QuestionManagePage` 的讀取流程（進入時呼叫 `getGoogleStatus`、`getCurrentDraft`；組合 `GoogleConnectionPanel`、`SheetLinkForm`、`SheetGrid`；錯誤以 `ErrorMessage` 顯示 message＋hint），並在 `frontend/src/main.tsx` 新增 `/teacher/questions`（`Guard role="TEACHER"`），使 T027 通過（依賴 T041～T043）
- [X] T045 [US1] 在 `frontend/src/pages/TeacherDashboard.tsx` 新增「題目管理」按鈕連到 `/teacher/questions`（撞色、觸控區 ≥ 44px；既有面板不變，FR-033），並在 `frontend/tests/routeGuards.test.tsx` 追加學生進入 `/teacher/questions` 顯示「此功能僅限老師使用」

**Checkpoint**: 可連結 Google、讀取學習單並顯示格子（尚不能標註與匯入）

---

## Phase 4: User Story 2 - 互動標註題目與作答格，單題與題組混合 (Priority: P1) 🎯 MVP 第 2 段

**Goal**: 老師在格子上新增單題／題組、點選題目格、作答格、共同題幹；清單即時更新、自動編號、可調整順序與重新指定；標註自動儲存於伺服器草稿。

**Independent Test**: 在題組範例上標註第 1、2 題為題組（各 2 小題，作答 H 欄）、第 3、4 題單題（作答 G 欄），清單顯示 4 題、6 個作答格，位置與點選的格子一致；重新整理頁面後標註仍在（spec US2）。

### Tests for User Story 2 ⚠️

- [X] T046 [P] [US2] 在 `shared/tests/annotation.test.ts` 追加 `validateAnnotations` 與 `autoNumber` 測試：每個 data-model.md §2.3 `IssueCode` 至少一個觸發案例（含 `CELL_ROLE_CONFLICT` 跨題、合併格內不同格視為同一格、`SAME_CELL_QA`、`QUESTION_TEXT_EMPTY`／`TOO_LONG`（2,001 字元）／`ERROR_VALUE`、`LABEL_INVALID`（空白、21 字元）、`LABEL_DUPLICATE`（去頭尾空白後重複）、`TOO_MANY_QUESTIONS`（201）、`TOO_MANY_PARTS`（11）、`SINGLE_SHAPE_INVALID`、完整性檢查只在 `{ complete: true }` 時報錯）；warnings（`ANSWER_HAS_CONTENT`、`CELL_HIDDEN`、`GROUP_SINGLE_PART`）；issues 超過 50 項只回 50 並帶 `totalIssues`；`autoNumber` 對 `labelManual=false` 依順序重編、`true` 保持不變（FR-017）；兩份範例的完整標註無 issue
- [X] T047 [P] [US2] 在 `backend/tests/integration/questionImport.annotate.test.ts` 撰寫 `PUT /api/question-import/drafts/:id/annotations`：正常儲存回 `revision+1`、自動題號、合併格正規化為左上角；結構錯誤仍儲存並回 `validation.issues`；201 題或 11 小題、`key` 格式錯誤、CellRef 格式錯誤 → 400 不儲存；revision 不符 → 409 `DRAFT_REVISION_CONFLICT`（`details.revision`）；過期（假時鐘 +31 分鐘）→ 410；他人草稿或不存在 → 404；body 約 500 KB 仍可接受；`GET /drafts/current` 回最新標註；學生 403
- [X] T048 [P] [US2] 在 `frontend/tests/AnnotationPanel.test.tsx` 撰寫：新增題目後步驟提示「請點選題目格」→「請點選作答格」→ 完成；設為題組並點選小題（1）（2）與共同題幹；重複指定同一格顯示「G5 已是第 1 題的作答格，請先移除原本的標註」；題目格無文字被拒絕；作答格已有內容顯示提醒；上下移動、刪除題目或小題、重新指定格子後清單與格子角標同步；未手動修改的題號隨順序重編；手動修改題號後保持
- [X] T049 [P] [US2] 在 `frontend/tests/useAnnotationDraft.test.ts` 撰寫：變更後 800 ms 防抖只送一次 PUT；`DRAFT_REVISION_CONFLICT` 時顯示「此學習單已在其他視窗修改，請重新載入」並重新取得草稿；`DRAFT_EXPIRED` 時提示重新讀取；離線錯誤保留本地狀態並可重試

### Implementation for User Story 2

- [X] T050 [US2] 在 `shared/src/annotation.ts` 實作 `validateAnnotations(doc, snapshot, { complete })` 與 `autoNumber(doc)`，並匯出 `export const AnnotationRules = { parseSheetLink, validateAnnotations, autoNumber }`（規則依 research R6；限制依 data-model.md §2.2 `AnnotatedQuestion.label`、`AnnotatedQuestion.parts`、`AnnotationDocument.questions`、§2.3 `ValidationResult.issues`、`ValidationResult.totalIssues`），使 T046 通過
- [X] T051 [US2] 在 `backend/src/schemas/questionImport.ts` 新增 `saveAnnotationsBody`（`revision` 非負整數；`annotations` 依 contracts/openapi.yaml `AnnotationDocument`：`questions` ≤ 200、`parts` ≤ 10、`key` `^[A-Za-z0-9]{4,12}$`、`label` ≤ 40 字元（去頭尾空白後的 1–20 字元由 `validateAnnotations` 判定）、`kind` 兩值、CellRef pattern）
- [X] T052 [US2] 在 `backend/src/services/questionImportService.ts` 實作 `saveAnnotations`（找草稿且屬於該使用者 → 過期丟 `DRAFT_EXPIRED` → 合併格正規化 → `autoNumber` → `validateAnnotations({ complete: false })` → `updateAnnotations` 樂觀鎖失敗丟 `DRAFT_REVISION_CONFLICT` → 延長 `expires_at` 30 分鐘；依 data-model.md §1.3 `import_drafts.annotations_json`、`import_drafts.revision`、`import_drafts.expires_at`）
- [X] T053 [US2] 在 `backend/src/routes/questionImportRoutes.ts` 新增 `PUT /drafts/:draftId/annotations`（此路由使用 `express.json({ limit: '1mb' })`，plan.md 實作要點 5），使 T047 通過
- [X] T054 [US2] 在 `frontend/src/questions/useAnnotationDraft.ts` 實作草稿 hook（持有 `AnnotationDocument`、產生 4–12 字元 `key`、套用 `autoNumber` 與本地 `validateAnnotations`、800 ms 防抖儲存、revision 衝突與過期處理），使 T049 通過
- [X] T055 [US2] 在 `frontend/src/questions/AnnotationPanel.tsx` 實作 `AnnotationPanel`（題目清單、單題／題組切換、目前步驟提示、共同題幹、題號編輯、上下移動與刪除、重新指定、選取格完整文字、issues／warnings 標示；手機為可展開的底部面板，收合時顯示目前步驟），使 T048 通過
- [X] T056 [US2] 在 `frontend/src/questions/SheetGrid.tsx` 加入標註角標（`題1`、`答1-2`、`幹3`，撞色底色）與目前步驟的可點選高亮；在 `frontend/src/pages/QuestionManagePage.tsx` 接上 `useAnnotationDraft`、`AnnotationPanel`，並在進入頁面時以 `getCurrentDraft` 續作（FR-021）；版面依 contracts/ui-routes.md「版面」三段斷點

**Checkpoint**: 可完整標註並自動保存（尚不能預覽與匯入）

---

## Phase 5: User Story 3 - 預覽、確認匯入並檢視目前題目集 (Priority: P1) 🎯 MVP 第 3 段

**Goal**: 預覽最終題目清單；確認後以單一 batchUpdate 把標註寫入試算表（不改任何儲存格），並在同一 DB 交易取代題目集；題目管理顯示目前題目集。

**Independent Test**: 標註單題範例 6 題 → 預覽 → 確認匯入，題目管理顯示來源、6 題、作答格 `學習單!G5`…；FakeGoogle 中所有儲存格內容未變，且 metadata 已寫入（spec US3）。

### Tests for User Story 3 ⚠️

- [X] T057 [P] [US3] 在 `backend/tests/unit/annotationCodec.test.ts` 撰寫 `AnnotationCodec`：兩份範例的完整標註 `encode` 後格式符合 data-model.md §3（`qimport.set`／`qimport.row`／`qimport.col`、`visibility: PROJECT`、共同題幹 `p = -1`）；同一欄只有一筆 `qimport.col`、同一列只有一筆 `qimport.row`；`encode` → `decode` 往返得到相同文件；200 題×10 小題時單一位置的 value 長度 < 30,000 字元；`fingerprint` 對相同 entries 穩定、順序不同結果相同
- [X] T058 [P] [US3] 在 `backend/tests/integration/questionImport.confirm.test.ts` 撰寫：`POST …/preview` 未完成 → 422 `ANNOTATION_INVALID` 列出所有 issues（≤ 50、`totalIssues`）；完整 → 200 `preview` 與 `replaces`（無題目集時 null、有題目集時含來源與題數）；`POST …/confirm` 成功 → 題目集與預覽一致、FakeGoogle 儲存格內容／合併未變、metadata 已寫入、事件 `IMPORTED`；再次 confirm 同一草稿 → 200 同結果且不重複寫入 metadata（FR-030）；確認前 `setCell` 改動標註格、`insertRows`，或在未標註區新增合併儲存格 → 409 `SHEET_CHANGED` 且 metadata 與題目集皆未變（FR-025）；只有檢視權限 → 403 `SHEET_NO_EDIT_PERMISSION`、訊息與 plan.md「錯誤情境與訊息」表一致、題目集不變且草稿仍為 OPEN（spec US3 情境 7）；batchUpdate 503 → 題目集不變；已有 6 題時匯入 4 題 → 完整取代；作答格預先填有文字時，匯入後資料庫（`answer_slots`、`import_drafts`）中搜尋不到該文字，只有 `answer_slots.answer_had_content = 1`（FR-022、spec US3 情境 8）；SC-004：對 T019 的 5 種變化版面各完成一次標註→確認，作答格位置與標註的格子 100% 一致；學生 403
- [X] T059 [P] [US3] 在 `backend/tests/integration/questionSet.view.test.ts` 撰寫 `GET /api/question-set`：無題目集回 `null`；有題目集時回 `QuestionSetView`（`questionCell`／`answerCell` 帶分頁名稱、題組含 `stem`、`partLabel` 為「（1）」）；學生 403
- [X] T060 [P] [US3] 在 `frontend/tests/ImportPreview.test.tsx` 撰寫：顯示題號、題目或小題文字、共同題幹、作答格位置、題數與作答格數、warnings；有 `replaces` 時顯示「確認匯入後將取代目前的題目集（…，6 題）」；422 時列出 issues 並回到標註；連按兩次確認只送一次；409 `SHEET_CHANGED` 顯示「學習單在標註期間被修改，請重新讀取並確認標註」
- [X] T061 [P] [US3] 在 `frontend/tests/QuestionSetPanel.test.tsx` 撰寫：無題目集時顯示「尚未匯入任何題目，請貼上學習單連結開始匯入」；有題目集時顯示來源、題數、匯入時間與全部題目；200 題可完整瀏覽（不截斷）

### Implementation for User Story 3

- [X] T062 [US3] 在 `backend/src/domain/annotationCodec.ts` 實作 `AnnotationCodec`（`encode`、`decode`、`fingerprint`；格式依 data-model.md §3 `qimport.set`、`qimport.row`、`qimport.col`；欄錨點 4–8 字元英數、每次 encode 重新產生；`decode` 在本階段只需處理完整往返，帶回的異常情況於 US4 補上），使 T057 通過
- [X] T063 [US3] 在 `backend/src/integrations/google/sheetsGateway.ts` 完成 `batchUpdate`（請求順序：`deleteDeveloperMetadata`（dataFilter：本分頁、三個 key）→ `createDeveloperMetadata`；寫入錯誤以 `mapGoogleError(…, 'write')` 對應），並在 `backend/tests/unit/sheetsGateway.test.ts` 追加請求內容與 403 對應的測試
- [X] T064 [US3] 在 `backend/src/services/sheetsService.ts` 實作 `replaceAnnotations`（取得 token、401 重試一次、呼叫 `batchUpdate`）
- [X] T065 [P] [US3] 在 `backend/src/db/questionSetRepository.ts` 實作 `class QuestionSetRepository`（`findCurrent`（含題目與作答項目，依 position／part_index 排序）、`replace`（同一交易刪除舊題目集後寫入）、`clear`；欄位依 data-model.md §1.4 `question_sets.spreadsheet_id`、`question_sets.spreadsheet_title`、`question_sets.sheet_id`、`question_sets.sheet_title`、`question_sets.source_url`、`question_sets.question_count`、`question_sets.slot_count`、`question_sets.imported_at`、`question_sets.imported_by`、`question_sets.draft_id`、§1.5 `question_set_questions.position`、`question_set_questions.question_key`、`question_set_questions.label`、`question_set_questions.kind`、`question_set_questions.stem_text`、`question_set_questions.stem_cell`、§1.6 `answer_slots.part_index`、`answer_slots.part_label`、`answer_slots.question_text`、`answer_slots.question_cell`、`answer_slots.answer_cell`、`answer_slots.answer_had_content`）
- [X] T066 [US3] 在 `backend/src/services/questionImportService.ts` 實作 `preview`（`validateAnnotations({ complete: true })`，有 issues 丟 `ANNOTATION_INVALID` 帶 `details.issues`／`totalIssues`；組出 data-model.md §2.4 `QuestionSetView` 與 `replaces`）與 `confirm`（順序依 plan.md 實作要點 4 與 diagrams/003-sequence-import.puml：CONFIRMED 草稿直接回既有結果 → 完整性驗證 → 重新 `readSheet` 並比對使用範圍、合併、標註格文字、metadata fingerprint（research R4）→ `encode` → `replaceAnnotations` → DB 交易內 `replace`、`markConfirmed`、事件 `IMPORTED`；DB 失敗時記 error log），使 T058 通過（依賴 T062～T065）
- [X] T067 [P] [US3] 在 `backend/src/services/questionSetService.ts` 實作 `QuestionSetService.getCurrent`（回 `QuestionSetView`，位置加分頁名稱）；`clear`、`reimport` 依類別圖簽章先佔位
- [X] T068 [US3] 在 `backend/src/routes/questionImportRoutes.ts` 新增 `POST /drafts/:draftId/preview`、`POST /drafts/:draftId/confirm`；在 `backend/src/routes/questionSetRoutes.ts` 實作 `GET /`；於 `backend/src/app.ts` 組裝 `QuestionSetRepository`、`QuestionSetService` 並掛載 `/api/question-set`，使 T059 通過
- [X] T069 [P] [US3] 在 `frontend/src/questions/ImportPreview.tsx` 實作 `ImportPreview`（預覽內容、取代提示、確認按鈕送出中停用、422 回到標註並顯示 issues、409 `SHEET_CHANGED` 提示重新讀取），使 T060 通過
- [X] T070 [P] [US3] 在 `frontend/src/questions/QuestionSetPanel.tsx` 實作 `QuestionSetPanel`（空狀態、來源、題數、匯入時間、題目與小題、作答格位置），使 T061 通過
- [X] T071 [US3] 在 `frontend/src/pages/QuestionManagePage.tsx` 串接「預覽匯入」→ `ImportPreview` →「確認匯入」→ 顯示「已匯入 N 題」與 `QuestionSetPanel`；進入頁面時呼叫 `getQuestionSet`；畫面狀態依 contracts/ui-routes.md 狀態圖

**Checkpoint**: MVP 完成——連結、讀取、標註、預覽、匯入、檢視題目集皆可運作（quickstart §5 情境 1～9、13、14）

---

## Phase 6: User Story 4 - 標註被記住：重新匯入同一份學習單自動帶回 (Priority: P2)

**Goal**: 讀取學習單時自動帶回試算表上的標註；插入／刪除列欄後仍對應原本格子；無法對應的標註提醒並標為未完成。

**Independent Test**: 匯入單題範例 6 題後，以 FakeGoogle 在第 3 列上方插入 2 列並新增第 7 題文字；重新匯入時前 6 題自動帶回且作答格順延 2 列（G5→G7），第 7 題可再標註（spec US4）。

### Tests for User Story 4 ⚠️

- [X] T072 [P] [US4] 在 `backend/tests/unit/annotationCodec.restore.test.ts` 撰寫 `decode` 情境：插入列／欄後位置正確移動；欄被刪除（欄錨點遺失）→ `RESTORED_CELL_MISSING` 且該小題格子為 null；列被刪除（`qimport.set` 有題但找不到列 metadata）→ `RESTORED_CELL_MISSING`；兩個標註落在同一格 → `RESTORED_CONFLICT`（兩者皆 null）；題目格已無文字 → 對應 issue；`labelManual` 與題號、題目順序完整還原
- [X] T073 [P] [US4] 在 `backend/tests/integration/questionSet.reimport.test.ts` 撰寫：`POST /api/question-set/reimport` 無題目集 → 404「目前沒有題目集可重新匯入」；有題目集 → 201 草稿 `restoredCount` 等於題數、事件 `REIMPORTED`；FakeGoogle `insertRows` 後帶回的位置順延；`deleteColumns` 刪掉作答欄後相關題目出現 warnings；答案已寫入作答格後帶回並出現 `ANSWER_HAS_CONTENT`；以 `POST /question-import/drafts` 貼上同一連結也會帶回；學生 403
- [X] T074 [P] [US4] 在 `frontend/tests/QuestionManagePage.test.tsx` 追加：草稿 `restoredCount > 0` 時顯示「已帶回上次的標註（N 題）」；帶回的 warnings 在清單中標為未完成；「清除所有標註重新開始」需確認，確認後清單清空並自動儲存

### Implementation for User Story 4

- [X] T075 [US4] 在 `backend/src/domain/annotationCodec.ts` 完成 `decode` 的帶回規則（research R3「帶回」段落；warnings 依 data-model.md §2.3 `RESTORED_CELL_MISSING`、`RESTORED_CONFLICT`），使 T072 通過
- [X] T076 [US4] 在 `backend/src/services/questionImportService.ts` 的 `createDraft` 加入帶回：`decode` 結果作為初始 `annotations`、`restoredCount` 寫入 data-model.md §1.3 `import_drafts.restored_count`，warnings 併入 `validation`；實作 `createDraftFromSource(userId, source)`（以題目集來源的 spreadsheetId／sheetId 讀取，不需連結）
- [X] T077 [US4] 在 `backend/src/services/questionSetService.ts` 實作 `reimport`（無題目集丟 `NOT_FOUND`；呼叫 `createDraftFromSource`；事件 `REIMPORTED`），在 `backend/src/routes/questionSetRoutes.ts` 新增 `POST /reimport`（201），使 T073 通過
- [X] T078 [US4] 在 `frontend/src/pages/QuestionManagePage.tsx` 與 `frontend/src/questions/QuestionSetPanel.tsx` 加入「重新匯入」按鈕、帶回提示與「清除所有標註重新開始」（確認後以空文件儲存），使 T074 通過

**Checkpoint**: 重新匯入可帶回標註，版面變動後位置正確（quickstart §5 情境 10、11）

---

## Phase 7: User Story 5 - 清除題目集與中斷 Google 連結 (Priority: P3)

**Goal**: 清除題目集（保留試算表上的標註）；中斷 Google 連結（題目集保留）。另完成供 F10 使用的 `locateAnswerCells` 與 `writeCells`（FR-007）。

**Independent Test**: 已匯入題目集後按「清除題目集」並確認，題目區回到「尚未匯入任何題目」；按「中斷 Google 連結」並確認後回到未連結狀態（spec US5）。

### Tests for User Story 5 ⚠️

- [X] T079 [P] [US5] 在 `backend/tests/integration/questionSet.clear.test.ts` 撰寫：`DELETE /api/question-set` 有題目集 → 204、題目集與題目、作答項目皆刪除、事件 `CLEARED`、FakeGoogle 的 metadata 仍在；無題目集 → 204；清除後再讀取同一學習單仍可帶回標註；學生 403
- [X] T080 [P] [US5] 在 `backend/tests/unit/sheetsService.f10.test.ts` 撰寫：`locateAnswerCells` 在插入列後回傳每個 `questionKey`＋`partIndex` 的目前格子；`writeCells` 只寫入指定格子、其他格子不變；無編輯權限 → `SHEET_NO_EDIT_PERMISSION`；在 `backend/tests/unit/sheetsGateway.test.ts` 追加 `updateValues` 請求內容（`values:batchUpdate`、`valueInputOption: RAW`）測試
- [X] T081 [P] [US5] 在 `frontend/tests/QuestionManagePage.test.tsx` 撰寫「清除題目集」確認與取消，以及中斷 Google 連結後目前題目集仍顯示

### Implementation for User Story 5

- [X] T082 [US5] 在 `backend/src/services/questionSetService.ts` 實作 `clear`（`QuestionSetRepository.clear` 與事件 `CLEARED`，不呼叫 Google），在 `backend/src/routes/questionSetRoutes.ts` 新增 `DELETE /`（204），使 T079 通過
- [X] T083 [US5] 在 `backend/src/integrations/google/sheetsGateway.ts` 完成 `updateValues`，在 `backend/src/services/sheetsService.ts` 實作 `locateAnswerCells`（readSheet → `AnnotationCodec.decode` → 回傳作答格的 `SlotLocation[]`）與 `writeCells`（`valueInputOption: RAW`，只寫入指定格子），使 T080 通過
- [X] T084 [US5] 在 `frontend/src/questions/QuestionSetPanel.tsx` 加入「清除題目集」（確認對話）並在清除後顯示空狀態，使 T081 通過

**Checkpoint**: 所有 user story 可獨立運作

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 安全、版面、設計圖一致性、文件與完整驗證

- [X] T085 [P] 在 `backend/tests/integration/questionNoSecrets.test.ts` 撰寫：完整跑一次連結→讀取→標註→確認→中斷，擷取 logger sink 與所有 HTTP 回應，斷言不含 FakeGoogle 發出的 access token、refresh token、授權碼、client secret、加密金鑰（SC-009、憲章原則 III）
- [X] T086 [P] 在 `backend/tests/integration/questionAuth.test.ts` 撰寫：以學生身分逐一呼叫 contracts/openapi.yaml 的所有本功能端點（OAuth 回呼除外）皆回 403「權限不足」，未登入皆回 401（FR-031、SC-008）
- [X] T087 [P] 在 `frontend/tests/style.test.tsx` 追加題目管理頁的 RWD 檢查：375px 時頁面容器無固定寬度造成水平捲動（格子區塊為 `overflow-auto`）、所有按鈕 `min-h-11`、`AnnotationPanel` 在 < 640px 時為底部面板（FR-034、SC-010）
- [X] T088 擴充 `backend/tests/architecture/diagram-consistency.test.ts`：同時讀取 `specs/001-foundation-auth-groups/plan.md` 與 `specs/003-sheets-question-import/plan.md`、`diagrams/001-*.puml` 與 `diagrams/003-*.puml`，組件／類別／允許清單取聯集；「無多餘檔案」檢查目錄加入 `integrations/google`；解析 `cloud` 元素時略過（外部服務）；處理標籤「RequireAuth / RequireRole」對應多個檔案；執行 `npm test -w backend` 通過（plan.md「實作階段的一致性驗證」）
- [X] T089 依 `diagrams/003-sequence-connect.puml`、`003-sequence-import.puml`、`003-sequence-reimport.puml` 逐步比對實際程式的呼叫順序、錯誤碼與分支，把結果記錄到 `specs/003-sheets-question-import/diagram-verification.md`；若有偏離，先改 `.puml` 並執行 `java -jar plantuml.jar "./diagrams/*.puml"` 重新產生 PNG，再同步 plan.md 對照表
- [X] T090 [P] 更新 `quickstart.md` §1～§2：分成「系統管理者一次性設定（Google Cloud 專案、OAuth 用戶端、測試使用者、測試模式 7 天授權期限）」與「老師的操作（只需按連結 Google 帳號）」；更新 `README.md` 的功能清單與 GOOGLE_* 環境變數說明
- [X] T091 執行 `npm run lint`、`npm run typecheck`、`npm test`，修正所有錯誤；記錄確切指令與通過／失敗數量（憲章原則 V）
- [X] T092 依 quickstart.md §5 以真實 Google 帳號與兩份範例學習單副本執行手動驗證情境 1～17，結果記錄到 `specs/003-sheets-question-import/manual-validation.md`（需系統管理者先完成 Google Cloud 設定；未執行的情境須註明原因）。SC-006 的「格式與附註未改變」只能在此驗證（FakeGoogle 不模擬格式）：匯入前後以 Google 試算表「版本記錄」確認沒有任何儲存格內容、格式或附註變更；並以真實 Google 補測 spec Edge Cases 中剪下貼上與排序後重新匯入的行為，記錄實際結果

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無相依，可立即開始
- **Foundational (Phase 2)**: 依賴 Setup；**阻擋所有 user story**
- **US1 (Phase 3)**: 依賴 Foundational
- **US2 (Phase 4)**: 依賴 US1（需要草稿與格子）
- **US3 (Phase 5)**: 依賴 US2（需要完整標註）
- **US4 (Phase 6)**: 依賴 US3（需要已寫入的標註與題目集）
- **US5 (Phase 7)**: 清除題目集依賴 US3；`locateAnswerCells` 依賴 US4 的 `decode`；中斷連結的前端部分可在 US1 後進行
- **Polish (Phase 8)**: 依賴所有 user story

### User Story Dependencies

本功能的 user story 是同一條匯入流程的連續步驟，因此**不是彼此獨立**：US1 → US2 → US3 為 MVP 主線，US4、US5 建立在 US3 之上。每個 story 仍可在完成時以其 Independent Test 單獨驗證。

### Within Each User Story

- 測試先寫並確認失敗
- 型別／repository → service → route → 前端元件 → 頁面整合
- 完成一個 story 的 Checkpoint 後再進入下一個

### Parallel Opportunities

- Phase 2：T003～T007（測試）可平行；T008、T010～T013、T015、T016、T019、T020 可平行
- US1：T021～T027 測試可平行；T028～T033 整合層與 repository 可平行；T041～T043 前端元件可平行
- US2：T046～T049 測試可平行
- US3：T057～T061 測試可平行；T065、T067、T069、T070 可平行
- US4、US5：各自測試任務可平行
- Polish：T085～T087、T090 可平行

---

## Parallel Example: User Story 1

```bash
# 同時撰寫 US1 的測試：
Task: "T021 GoogleOAuthClient 單元測試 in backend/tests/unit/googleOAuthClient.test.ts"
Task: "T022 SheetsGateway 單元測試 in backend/tests/unit/sheetsGateway.test.ts"
Task: "T023 OAuth 整合測試 in backend/tests/integration/google.oauth.test.ts"
Task: "T026 SheetGrid 元件測試 in frontend/tests/SheetGrid.test.tsx"

# 同時實作整合層與 repository：
Task: "T028 GoogleOAuthClient in backend/src/integrations/google/googleOAuthClient.ts"
Task: "T029 SheetsGateway in backend/src/integrations/google/sheetsGateway.ts"
Task: "T030 GoogleConnectionRepository in backend/src/db/googleConnectionRepository.ts"
Task: "T033 ImportDraftRepository in backend/src/db/importDraftRepository.ts"

# 同時實作前端元件：
Task: "T041 GoogleConnectionPanel in frontend/src/questions/GoogleConnectionPanel.tsx"
Task: "T042 SheetLinkForm in frontend/src/questions/SheetLinkForm.tsx"
Task: "T043 SheetGrid in frontend/src/questions/SheetGrid.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "T057 AnnotationCodec 單元測試 in backend/tests/unit/annotationCodec.test.ts"
Task: "T058 確認匯入整合測試 in backend/tests/integration/questionImport.confirm.test.ts"
Task: "T060 ImportPreview 元件測試 in frontend/tests/ImportPreview.test.tsx"
Task: "T061 QuestionSetPanel 元件測試 in frontend/tests/QuestionSetPanel.test.tsx"
```

---

## Implementation Strategy

### MVP First（US1＋US2＋US3）

1. 完成 Phase 1、Phase 2
2. 完成 US1 → 驗證可讀取並顯示格子
3. 完成 US2 → 驗證可標註並自動保存
4. 完成 US3 → **停下來驗證**：兩份範例都能標註、預覽、匯入，且試算表內容未變（M2 Demo）
5. 先跑 T088（設計圖一致性）與 T091（全部測試），確認 MVP 本身符合品質關卡

### Incremental Delivery

1. Setup＋Foundational → 基礎就緒
2. US1 → US2 → US3 → MVP Demo
3. US4 → 重新匯入帶回標註（版面變動後仍正確）
4. US5 → 清除與中斷、F10 用的定位與寫入能力
5. Polish → 安全、RWD、設計圖驗證、手動驗證

### Parallel Team Strategy

1. 全員完成 Setup＋Foundational
2. 之後可分工：
   - 開發者 A：後端 US1→US3（整合層、service、route）
   - 開發者 B：前端 US1→US3（SheetGrid、AnnotationPanel、ImportPreview）
   - 開發者 C：shared 規則（T046、T050）與 AnnotationCodec（T057、T062、T072、T075）
3. 以 contracts/openapi.yaml 與 `@buzzer/shared` 型別作為前後端的介面約定

---

## Notes

- [P] 任務＝不同檔案、不依賴未完成的任務
- [Story] 標籤對應 spec.md 的 user story
- 先寫測試並確認失敗，再實作
- 每完成一個任務或一組相關任務就 commit
- 每個 Checkpoint 都可停下來單獨驗證
- 偏離設計圖前，先改 `.puml`、重新產生 PNG、更新 plan.md（憲章原則 VI）
- 不得在測試、fixture 或文件中放入真實 Google 憑證或真實學生資料
