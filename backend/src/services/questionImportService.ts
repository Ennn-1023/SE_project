/**
 * QuestionImportService（組件圖 003-component、diagrams/003-sequence-import.puml）：
 * 讀取學習單建立標註草稿、儲存標註、預覽與確認匯入。
 */
import { randomUUID } from 'node:crypto';
import {
  autoNumber,
  cellAt,
  normalizeAnnotations,
  parseSheetLink,
  partLabel,
  validateAnnotations,
  type AnnotationDocument,
  type CellRef,
  type GridSnapshot,
  type QuestionSetView,
  type SheetSource,
  type ValidationResult,
} from '@buzzer/shared';
import type { AnnotationCodec } from '../domain/annotationCodec.js';
import type {
  ImportDraftRepository,
  QuestionEventRepository,
  QuestionSetRepository,
} from '../domain/questionPorts.js';
import type { ImportDraft, QuestionSetRecord } from '../domain/questionTypes.js';
import type { Clock } from '../lib/clock.js';
import { appError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { recordToView } from './questionSetService.js';
import type { SheetsService } from './sheetsService.js';

export const DRAFT_TTL_MS = 30 * 60_000;

import type { ActivityLockGuard } from './activityLockGuard.js';

export interface QuestionImportServiceDeps {
  sheets: SheetsService;
  codec: AnnotationCodec;
  drafts: ImportDraftRepository;
  sets: QuestionSetRepository;
  events: QuestionEventRepository;
  clock: Clock;
  logger: Logger;
  runInTransaction: <T>(fn: () => T) => T;
  /** 004：活動進行中禁止確認匯入（FR-005） */
  lock?: ActivityLockGuard;
}

export interface DraftWithValidation {
  draft: ImportDraft;
  validation: ValidationResult;
}

export interface PreviewResult {
  preview: QuestionSetView;
  replaces: { spreadsheetTitle: string; sheetTitle: string; questionCount: number } | null;
}

const hasContent = (grid: GridSnapshot, cell: CellRef) => {
  const c = cellAt(grid, cell);
  return c.text !== '' || c.error;
};

/** 由草稿（標註＋讀取當下的快照）組出要保存的題目集；不保存作答格的內容（FR-022）。 */
export function draftToRecord(draft: ImportDraft, importedAt: Date): QuestionSetRecord {
  const grid = draft.snapshot;
  const questions = draft.annotations.questions.map((q, i) => ({
    position: i + 1,
    questionKey: q.key,
    label: q.label.trim(),
    kind: q.kind,
    stemText: q.kind === 'GROUP' && q.stemCell ? cellAt(grid, q.stemCell).text : null,
    stemCell: q.kind === 'GROUP' ? q.stemCell : null,
    slots: q.parts.map((p, pi) => ({
      partIndex: pi,
      partLabel: q.kind === 'GROUP' ? partLabel(pi) : null,
      questionText: cellAt(grid, p.questionCell!).text,
      questionCell: p.questionCell!,
      answerCell: p.answerCell!,
      answerHadContent: hasContent(grid, p.answerCell!),
    })),
  }));
  return {
    set: {
      source: draft.source,
      questionCount: questions.length,
      slotCount: questions.reduce((n, q) => n + q.slots.length, 0),
      importedAt,
      importedBy: draft.userId,
      draftId: draft.id,
    },
    questions,
  };
}

/** 標註用到的所有格子。 */
function annotatedCells(doc: AnnotationDocument): CellRef[] {
  const cells: CellRef[] = [];
  for (const q of doc.questions) {
    if (q.stemCell) cells.push(q.stemCell);
    for (const p of q.parts) {
      if (p.questionCell) cells.push(p.questionCell);
      if (p.answerCell) cells.push(p.answerCell);
    }
  }
  return cells;
}

const mergeKey = (g: GridSnapshot) =>
  g.merges
    .map((m) => `${m.start}:${m.end}`)
    .sort()
    .join(',');

export class QuestionImportService {
  constructor(private readonly deps: QuestionImportServiceDeps) {}

  private validationOf(draft: ImportDraft, complete = false): ValidationResult {
    return validateAnnotations(draft.annotations, draft.snapshot, { complete });
  }

  /** 找到屬於該老師、仍可編輯的草稿；不存在 → NOT_FOUND，過期 → DRAFT_EXPIRED。 */
  private openDraft(userId: number, draftId: string): ImportDraft {
    const draft = this.deps.drafts.findById(draftId);
    if (!draft || draft.userId !== userId || draft.status === 'CANCELLED') {
      throw appError('NOT_FOUND', { message: '找不到這份標註草稿', hint: '請重新讀取學習單' });
    }
    if (draft.status === 'OPEN' && this.isExpired(draft)) {
      this.deps.drafts.markCancelled(draft.id, this.deps.clock.now());
      throw appError('DRAFT_EXPIRED');
    }
    return draft;
  }

  private isExpired(draft: ImportDraft): boolean {
    return draft.expiresAt.getTime() <= this.deps.clock.now().getTime();
  }

  /** 讀取學習單並建立草稿（FR-005、FR-008）；該老師既有的 OPEN 草稿改為 CANCELLED。 */
  async createDraft(userId: number, link: string, sheetId?: number): Promise<DraftWithValidation> {
    const parsed = parseSheetLink(link);
    if (!parsed.ok) {
      throw appError('SHEET_LINK_INVALID', {
        message: parsed.message,
        hint: parsed.hint,
        field: 'link',
      });
    }
    return this.buildDraft(
      userId,
      parsed.link.spreadsheetId,
      sheetId ?? parsed.link.gid,
      link.trim(),
    );
  }

  private async buildDraft(
    userId: number,
    spreadsheetId: string,
    sheetId: number | null,
    sourceUrl: string,
  ): Promise<DraftWithValidation> {
    const data = await this.deps.sheets.readSheet(userId, spreadsheetId, sheetId);
    const now = this.deps.clock.now();
    // 帶回試算表上先前保存的標註（FR-024）
    const restored = this.deps.codec.decode(data.metadata, data.grid);
    const annotations = autoNumber(normalizeAnnotations(restored.doc, data.grid));
    const draft: ImportDraft = {
      id: randomUUID(),
      userId,
      status: 'OPEN',
      source: {
        spreadsheetId,
        spreadsheetTitle: data.spreadsheetTitle,
        sheetId: data.sheet.sheetId,
        sheetTitle: data.sheet.title,
        sourceUrl,
      },
      sheets: data.sheets,
      snapshot: data.grid,
      metadataFingerprint: this.deps.codec.fingerprint(data.metadata),
      annotations,
      restoredCount: annotations.questions.length,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + DRAFT_TTL_MS),
    };
    this.deps.drafts.create(draft);
    const validation = this.validationOf(draft);
    return {
      draft,
      validation: { ...validation, warnings: [...restored.warnings, ...validation.warnings] },
    };
  }

  /** 以目前題目集的來源重新讀取（不需連結；US4）。 */
  async createDraftFromSource(userId: number, source: SheetSource): Promise<DraftWithValidation> {
    return this.buildDraft(userId, source.spreadsheetId, source.sheetId, source.sourceUrl);
  }

  /** 目前未過期的草稿（FR-021 續作）。 */
  getCurrentDraft(userId: number): DraftWithValidation | null {
    const draft = this.deps.drafts.findOpenByUser(userId);
    if (!draft) return null;
    if (this.isExpired(draft)) {
      this.deps.drafts.markCancelled(draft.id, this.deps.clock.now());
      return null;
    }
    return { draft, validation: this.validationOf(draft) };
  }

  /**
   * 儲存整份標註文件（FR-013～FR-021）：正規化合併格、自動題號、驗證（不含完整性），
   * 以 revision 樂觀鎖防止兩個視窗互相覆蓋，並延長草稿期限 30 分鐘。
   */
  saveAnnotations(
    userId: number,
    draftId: string,
    revision: number,
    doc: AnnotationDocument,
  ): DraftWithValidation {
    const draft = this.openDraft(userId, draftId);
    if (draft.status !== 'OPEN' || draft.revision !== revision) {
      throw appError('DRAFT_REVISION_CONFLICT', { details: { revision: draft.revision } });
    }
    const now = this.deps.clock.now();
    const annotations = autoNumber(normalizeAnnotations(doc, draft.snapshot));
    const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS);
    const ok = this.deps.drafts.updateAnnotations(draftId, revision, {
      annotations,
      expiresAt,
      updatedAt: now,
    });
    if (!ok) {
      const latest = this.deps.drafts.findById(draftId);
      throw appError('DRAFT_REVISION_CONFLICT', {
        details: { revision: latest?.revision ?? revision },
      });
    }
    const saved: ImportDraft = {
      ...draft,
      annotations,
      expiresAt,
      updatedAt: now,
      revision: revision + 1,
    };
    return { draft: saved, validation: this.validationOf(saved) };
  }

  /** 完整性檢查失敗時丟 ANNOTATION_INVALID（details.issues ≤ 50、totalIssues）。 */
  private assertComplete(draft: ImportDraft): ValidationResult {
    const validation = this.validationOf(draft, true);
    if (validation.totalIssues > 0) {
      throw appError('ANNOTATION_INVALID', {
        message: `標註尚未完成或有錯誤（共 ${validation.totalIssues} 項）`,
        details: { issues: validation.issues, totalIssues: validation.totalIssues },
      });
    }
    return validation;
  }

  /** 預覽匯入（FR-020、FR-026、FR-027）。 */
  preview(userId: number, draftId: string): PreviewResult {
    const draft = this.openDraft(userId, draftId);
    if (draft.status !== 'OPEN') {
      throw appError('NOT_FOUND', { message: '這份標註草稿已匯入', hint: '請重新讀取學習單' });
    }
    const validation = this.assertComplete(draft);
    const current = this.deps.sets.findCurrent();
    return {
      preview: recordToView(draftToRecord(draft, this.deps.clock.now()), {
        warnings: validation.warnings,
        includeImportedAt: false,
      }),
      replaces: current
        ? {
            spreadsheetTitle: current.set.source.spreadsheetTitle,
            sheetTitle: current.set.source.sheetTitle,
            questionCount: current.set.questionCount,
          }
        : null,
    };
  }

  /**
   * 確認匯入（diagrams/003-sequence-import.puml）：完整性驗證 → 重新讀取並比對（research R4）
   * → 以單一 batchUpdate 取代試算表上的標註 → DB 交易內取代題目集、草稿 CONFIRMED、記錄事件。
   * 已確認過的草稿再次呼叫時回傳既有結果（FR-030）。
   */
  async confirm(userId: number, draftId: string): Promise<QuestionSetView> {
    // 004：活動進行中不可取代題目集（FR-005）；讀取學習單與標註不鎖
    this.deps.lock?.assertQuestionSetMutable();
    const draft = this.openDraft(userId, draftId);
    if (draft.status === 'CONFIRMED') {
      const current = this.deps.sets.findCurrent();
      if (current && current.set.draftId === draft.id) return recordToView(current);
      throw appError('NOT_FOUND', { message: '這份標註草稿已匯入', hint: '請重新讀取學習單' });
    }
    this.assertComplete(draft);
    const { source } = draft;
    const fresh = await this.deps.sheets.readSheet(userId, source.spreadsheetId, source.sheetId);
    const changed =
      fresh.grid.rowCount !== draft.snapshot.rowCount ||
      fresh.grid.columnCount !== draft.snapshot.columnCount ||
      mergeKey(fresh.grid) !== mergeKey(draft.snapshot) ||
      this.deps.codec.fingerprint(fresh.metadata) !== draft.metadataFingerprint ||
      annotatedCells(draft.annotations).some((cell) => {
        const a = cellAt(draft.snapshot, cell);
        const b = cellAt(fresh.grid, cell);
        return a.text !== b.text || a.error !== b.error;
      });
    if (changed) throw appError('SHEET_CHANGED');

    const entries = this.deps.codec.encode(draft.annotations, draft.snapshot, source.sheetId);
    await this.deps.sheets.replaceAnnotations(
      userId,
      source.spreadsheetId,
      source.sheetId,
      entries,
    );

    const now = this.deps.clock.now();
    const record = draftToRecord(draft, now);
    try {
      this.deps.runInTransaction(() => {
        this.deps.sets.replace(record);
        this.deps.drafts.markConfirmed(draft.id, now);
        this.deps.events.record({
          at: now,
          actorUserId: userId,
          type: 'IMPORTED',
          spreadsheetId: source.spreadsheetId,
          sheetTitle: source.sheetTitle,
          questionCount: record.set.questionCount,
        });
      });
    } catch (err) {
      // 試算表上的標註已更新；下次重新匯入可帶回（plan.md 實作要點 4）
      this.deps.logger.error('question set save failed after annotations were written', {
        draftId: draft.id,
        error: err instanceof Error ? err.name : 'unknown',
      });
      throw err;
    }
    return recordToView(record);
  }

  /** 取消草稿（不保存、不寫入試算表）。 */
  cancel(userId: number, draftId: string): void {
    const draft = this.deps.drafts.findById(draftId);
    if (!draft || draft.userId !== userId) {
      throw appError('NOT_FOUND', { message: '找不到這份標註草稿', hint: '請重新讀取學習單' });
    }
    this.deps.drafts.markCancelled(draftId, this.deps.clock.now());
  }
}
