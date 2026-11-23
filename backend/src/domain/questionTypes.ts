/**
 * 003 類別圖（diagrams/003-class.puml）的實體型別；資料表見 data-model.md §1。
 */
import type {
  AnnotationDocument,
  CellRef,
  GridSnapshot,
  QuestionKind,
  SheetSource,
  SheetTab,
} from '@buzzer/shared';

export type DraftStatus = 'OPEN' | 'CONFIRMED' | 'CANCELLED';

export type QuestionEventType =
  'GOOGLE_CONNECTED' | 'GOOGLE_DISCONNECTED' | 'IMPORTED' | 'REIMPORTED' | 'CLEARED';

/** data-model.md §1.1 */
export interface GoogleConnection {
  userId: number;
  googleEmail: string;
  refreshTokenEnc: string;
  accessTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string;
  connectedAt: Date;
  lastUsedAt: Date;
}

/** data-model.md §1.2 */
export interface OAuthState {
  state: string;
  userId: number;
  sessionId: string;
  codeVerifierEnc: string;
  createdAt: Date;
  expiresAt: Date;
}

/** data-model.md §1.3 */
export interface ImportDraft {
  id: string;
  userId: number;
  status: DraftStatus;
  source: SheetSource;
  sheets: SheetTab[];
  snapshot: GridSnapshot;
  metadataFingerprint: string;
  annotations: AnnotationDocument;
  restoredCount: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

/** data-model.md §1.4 */
export interface QuestionSet {
  source: SheetSource;
  questionCount: number;
  slotCount: number;
  importedAt: Date;
  importedBy: number;
  draftId: string;
}

/** data-model.md §1.6 */
export interface AnswerSlot {
  partIndex: number;
  partLabel: string | null;
  questionText: string;
  questionCell: CellRef;
  answerCell: CellRef;
  answerHadContent: boolean;
}

/** data-model.md §1.5 */
export interface ImportedQuestion {
  position: number;
  questionKey: string;
  label: string;
  kind: QuestionKind;
  stemText: string | null;
  stemCell: CellRef | null;
  slots: AnswerSlot[];
}

/** 題目集與其題目（QuestionSetRepository 的讀寫單位）。 */
export interface QuestionSetRecord {
  set: QuestionSet;
  questions: ImportedQuestion[];
}

/** data-model.md §1.7 */
export interface QuestionEvent {
  at: Date;
  actorUserId: number;
  type: QuestionEventType;
  spreadsheetId: string | null;
  sheetTitle: string | null;
  questionCount: number | null;
}
