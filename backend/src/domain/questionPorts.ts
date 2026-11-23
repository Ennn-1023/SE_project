/**
 * 003 類別圖（diagrams/003-class.puml）的介面：外部整合（Google）與 repository。
 * 實作類別與介面同名，見 plan.md 組件對照表。
 */
import type { CellRef, GridSnapshot, SheetTab } from '@buzzer/shared';
import type {
  GoogleConnection,
  ImportDraft,
  OAuthState,
  QuestionEvent,
  QuestionSetRecord,
} from './questionTypes.js';

// ---------- Google ----------

export interface TokenSet {
  accessToken: string;
  /** 交換授權碼時一定有；更新 token 時 Google 不一定回傳 */
  refreshToken: string | null;
  /** 以空白分隔 */
  scope: string;
  expiresInSeconds: number;
}

export interface SpreadsheetInfo {
  title: string;
  sheets: SheetTab[];
}

export interface UsedRange {
  /** 0 表示空白分頁 */
  rowCount: number;
  columnCount: number;
}

/** developer metadata（research R3、data-model.md §3）。 */
export interface MetadataEntry {
  key: 'qimport.set' | 'qimport.row' | 'qimport.col';
  value: string;
  location:
    | { type: 'SHEET'; sheetId: number }
    | { type: 'ROW' | 'COLUMN'; sheetId: number; /** 0 起算 */ index: number };
}

export interface SheetData {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheets: SheetTab[];
  sheet: SheetTab;
  grid: GridSnapshot;
  metadata: MetadataEntry[];
}

export interface SlotLocation {
  questionKey: string;
  partIndex: number;
  answerCell: CellRef;
}

export interface CellUpdate {
  cell: CellRef;
  value: string;
}

/** batchUpdate 的請求：取代本系統在某分頁上的所有標註。 */
export type SheetBatchRequest =
  | { kind: 'deleteMetadata'; sheetId: number; keys: MetadataEntry['key'][] }
  | { kind: 'createMetadata'; entry: MetadataEntry };

export interface GoogleOAuthClient {
  buildAuthUrl(state: string, codeChallenge: string): string;
  exchangeCode(code: string, codeVerifier: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  revoke(token: string): Promise<void>;
  fetchEmail(accessToken: string): Promise<string>;
}

export interface SheetsGateway {
  getSpreadsheet(token: string, spreadsheetId: string): Promise<SpreadsheetInfo>;
  getUsedRange(token: string, spreadsheetId: string, sheetTitle: string): Promise<UsedRange>;
  getGrid(
    token: string,
    spreadsheetId: string,
    sheetTitle: string,
    range: UsedRange,
  ): Promise<GridSnapshot>;
  searchMetadata(token: string, spreadsheetId: string, sheetId: number): Promise<MetadataEntry[]>;
  batchUpdate(token: string, spreadsheetId: string, requests: SheetBatchRequest[]): Promise<void>;
  updateValues(
    token: string,
    spreadsheetId: string,
    sheetTitle: string,
    updates: CellUpdate[],
  ): Promise<void>;
}

// ---------- Repositories ----------

export interface GoogleConnectionRepository {
  findByUser(userId: number): GoogleConnection | null;
  upsert(connection: GoogleConnection): void;
  updateAccessToken(userId: number, accessTokenEnc: string, expiresAt: Date, now: Date): void;
  delete(userId: number): void;
}

export interface OAuthStateRepository {
  create(state: OAuthState): void;
  take(state: string): OAuthState | null;
  deleteExpired(now: Date): void;
}

export interface ImportDraftRepository {
  create(draft: ImportDraft): void;
  findById(id: string): ImportDraft | null;
  findOpenByUser(userId: number): ImportDraft | null;
  updateAnnotations(
    id: string,
    expectedRevision: number,
    draft: Pick<ImportDraft, 'annotations' | 'expiresAt' | 'updatedAt'>,
  ): boolean;
  markConfirmed(id: string, now: Date): void;
  markCancelled(id: string, now: Date): void;
}

export interface QuestionSetRepository {
  findCurrent(): QuestionSetRecord | null;
  replace(record: QuestionSetRecord): void;
  clear(): void;
}

export interface QuestionEventRepository {
  record(event: QuestionEvent): void;
}
