import type { ImportDraftRepository as Port } from '../domain/questionPorts.js';
import type { DraftStatus, ImportDraft } from '../domain/questionTypes.js';
import type { Database } from '../lib/db.js';
import { transaction } from '../lib/db.js';

interface Row {
  id: string;
  user_id: number;
  status: DraftStatus;
  spreadsheet_id: string;
  spreadsheet_title: string;
  sheet_id: number;
  sheet_title: string;
  source_url: string;
  sheets_json: string;
  snapshot_json: string;
  metadata_fingerprint: string;
  annotations_json: string;
  restored_count: number;
  revision: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

function toDraft(row: Row): ImportDraft {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    source: {
      spreadsheetId: row.spreadsheet_id,
      spreadsheetTitle: row.spreadsheet_title,
      sheetId: row.sheet_id,
      sheetTitle: row.sheet_title,
      sourceUrl: row.source_url,
    },
    sheets: JSON.parse(row.sheets_json),
    snapshot: JSON.parse(row.snapshot_json),
    metadataFingerprint: row.metadata_fingerprint,
    annotations: JSON.parse(row.annotations_json),
    restoredCount: row.restored_count,
    revision: row.revision,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: new Date(row.expires_at),
  };
}

/** ImportDraftRepository（data-model.md §1.3 `import_drafts`）。 */
export class ImportDraftRepository implements Port {
  constructor(private readonly db: Database) {}

  /** 建立新草稿；同一交易中把該老師既有的 OPEN 草稿改為 CANCELLED。 */
  create(d: ImportDraft): void {
    transaction(this.db, () => {
      this.db
        .prepare(
          `UPDATE import_drafts SET status = 'CANCELLED', updated_at = ? WHERE user_id = ? AND status = 'OPEN'`,
        )
        .run(d.createdAt.toISOString(), d.userId);
      this.db
        .prepare(
          `INSERT INTO import_drafts (id, user_id, status, spreadsheet_id, spreadsheet_title, sheet_id,
             sheet_title, source_url, sheets_json, snapshot_json, metadata_fingerprint, annotations_json,
             restored_count, revision, created_at, updated_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          d.id,
          d.userId,
          d.status,
          d.source.spreadsheetId,
          d.source.spreadsheetTitle,
          d.source.sheetId,
          d.source.sheetTitle,
          d.source.sourceUrl,
          JSON.stringify(d.sheets),
          JSON.stringify(d.snapshot),
          d.metadataFingerprint,
          JSON.stringify(d.annotations),
          d.restoredCount,
          d.revision,
          d.createdAt.toISOString(),
          d.updatedAt.toISOString(),
          d.expiresAt.toISOString(),
        );
    });
  }

  findById(id: string): ImportDraft | null {
    const row = this.db.prepare('SELECT * FROM import_drafts WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toDraft(row) : null;
  }

  findOpenByUser(userId: number): ImportDraft | null {
    const row = this.db
      .prepare("SELECT * FROM import_drafts WHERE user_id = ? AND status = 'OPEN'")
      .get(userId) as Row | undefined;
    return row ? toDraft(row) : null;
  }

  /** 樂觀鎖：revision 相符才更新並 +1，回傳是否成功。 */
  updateAnnotations(
    id: string,
    expectedRevision: number,
    d: Pick<ImportDraft, 'annotations' | 'expiresAt' | 'updatedAt'>,
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE import_drafts
         SET annotations_json = ?, revision = revision + 1, updated_at = ?, expires_at = ?
         WHERE id = ? AND revision = ? AND status = 'OPEN'`,
      )
      .run(
        JSON.stringify(d.annotations),
        d.updatedAt.toISOString(),
        d.expiresAt.toISOString(),
        id,
        expectedRevision,
      );
    return Number(result.changes) === 1;
  }

  markConfirmed(id: string, now: Date): void {
    this.db
      .prepare("UPDATE import_drafts SET status = 'CONFIRMED', updated_at = ? WHERE id = ?")
      .run(now.toISOString(), id);
  }

  markCancelled(id: string, now: Date): void {
    this.db
      .prepare(
        "UPDATE import_drafts SET status = 'CANCELLED', updated_at = ? WHERE id = ? AND status = 'OPEN'",
      )
      .run(now.toISOString(), id);
  }
}
