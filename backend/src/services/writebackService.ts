/**
 * WritebackService（005 組件圖、diagrams/005-sequence-writeback.puml、research R3～R8）：
 * 把每題搶答成功組別的答案寫回本場活動的來源學習單。
 *
 * - 預覽：readSheet 一次取得格子與標註 → AnnotationCodec.decode 還原作答格目前位置 → 比對目前內容。
 *   預覽只存在記憶體，每位老師保留最新一份，15 分鐘後失效（R4）。
 * - 確認：同步檢查並設定 WRITING（冪等，R8）→ 重新讀取並比對（R5）→ 依覆蓋選項篩選 →
 *   以單一 RAW 批次寫入（R6）。任何錯誤都不會留下只寫一半的試算表。
 * - 紀錄只寫計數與錯誤碼，不含答案、試算表內容或 token（FR-025）。
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  WritebackRules,
  normalizeToMergeTopLeft,
  parseCellRef,
  type CellRef,
  type OverwriteMode,
  type SkipReason,
  type SkippedCellReason,
  type WritebackItemStatus,
  type WritebackOutcomeView,
  type WritebackPreviewView,
} from '@buzzer/shared';
import type { ExportEventRepository } from '../db/exportEventRepository.js';
import type {
  AnswerSlotFallback,
  WritebackTarget,
  WritebackTargetRepository,
} from '../db/writebackTargetRepository.js';
import type { AnnotationCodec } from '../domain/annotationCodec.js';
import type { CellUpdate, SheetData } from '../domain/questionPorts.js';
import type { Clock } from '../lib/clock.js';
import { AppError, appError, ErrorCodes, type ErrorCode } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { ActivityResultReader, QuestionOutcome } from './activityResultReader.js';
import type { SheetsService } from './sheetsService.js';

/** 預覽有效期限（research R4） */
export const PREVIEW_TTL_MS = 15 * 60_000;

/** 預覽狀態（diagrams/005-class.puml；data-model.md §3.1 WritebackPreview.state） */
export type PreviewState = 'READY' | 'WRITING' | 'DONE';

/** data-model.md §3.2 */
export interface WritebackItem {
  /** `${questionKey}:${partIndex}` */
  key: string;
  questionKey: string;
  questionNumber: string;
  partIndex: number;
  partLabel: string | null;
  cell: CellRef | null;
  fallbackCell: CellRef | null;
  hidden: boolean;
  winnerTeamName: string;
  answer: string;
  currentContent: string;
  status: WritebackItemStatus;
  /** ANNOTATION_MISSING 時實際要寫入的後備格（合併格正規化為左上角）；只在伺服器內使用 */
  fallbackTarget?: CellRef | null;
}

export interface SkippedQuestion {
  questionNumber: string;
  reason: SkipReason;
}

export interface WritebackSummary {
  emptyCount: number;
  overwriteCount: number;
  sameCount: number;
  unresolvedCount: number;
  skippedQuestionCount: number;
}

export interface SkippedReasonCount {
  reason: SkippedCellReason;
  count: number;
}

/** data-model.md §3.4 */
export interface WritebackOutcome {
  writtenCells: number;
  writtenQuestions: number;
  overwrittenCells: number;
  skippedCells: number;
  skippedReasons: SkippedReasonCount[];
  spreadsheetUrl: string;
}

/** data-model.md §3.1（只存在記憶體） */
export interface WritebackPreview {
  previewId: string;
  teacherId: number;
  activityId: string;
  target: WritebackTarget;
  /** 預覽當下的試算表名稱與分頁名稱（顯示用） */
  currentTitles: { spreadsheetTitle: string; sheetTitle: string };
  createdAt: Date;
  resultFingerprint: string;
  items: WritebackItem[];
  skipped: SkippedQuestion[];
  summary: WritebackSummary;
  state: PreviewState;
  outcome: WritebackOutcome | null;
}

export interface WritebackServiceDeps {
  reader: ActivityResultReader;
  targets: WritebackTargetRepository;
  sheets: Pick<SheetsService, 'readSheet' | 'writeCells'>;
  codec: Pick<AnnotationCodec, 'decode'>;
  events: ExportEventRepository;
  clock: Clock;
  logger: Logger;
}

const SKIP_REASON_ORDER: SkippedCellReason[] = [
  'NON_EMPTY',
  'ANNOTATION_MISSING',
  'ANNOTATION_DUPLICATED',
];

/** 有效結果指紋：每題「狀態、有效輪次、成功組別」排序後的 SHA-256（research R5） */
function fingerprintOf(outcomes: QuestionOutcome[]): string {
  const parts = outcomes
    .map((o) => `${o.questionId}:${o.status}:${o.round}:${o.winner?.teamId ?? '-'}`)
    .sort();
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

const questionLabel = (n: string) => `第 ${n} 題`;

export class WritebackService {
  private readonly previews = new Map<string, WritebackPreview>();
  /** 同時只允許一個寫回進行（不同預覽也不可並行，research R8） */
  private writing = false;

  constructor(private readonly deps: WritebackServiceDeps) {}

  /** 寫回預覽（FR-006～FR-011）：不修改試算表 */
  async preview(teacherId: number): Promise<WritebackPreviewView> {
    const { reader, targets } = this.deps;
    const activity = reader.latestActivity();
    if (!activity) throw appError('NO_ACTIVITY_RESULTS');
    const target = targets.getTarget(activity.id);
    if (!target) throw appError('WRITEBACK_NO_SOURCE');

    const outcomes = reader.validResults(activity.id);
    const skipped = this.skippedOf(outcomes);
    if (!outcomes.some((o) => o.winner)) throw appError('WRITEBACK_NOTHING_TO_WRITE');

    const sheet = await this.readTarget(teacherId, target);
    const items = this.resolveItems(outcomes, sheet, targets.getFallbacks(activity.id));
    if (items.length > 0 && items.every((i) => i.status === 'ANNOTATION_MISSING')) {
      throw appError('WRITEBACK_NOT_THIS_SHEET', {
        hint: `請確認是否為本場活動使用的學習單：${target.spreadsheetTitle}／${target.sheetTitle}`,
        details: {
          spreadsheetTitle: target.spreadsheetTitle,
          sheetTitle: target.sheetTitle,
          url: target.sourceUrl,
        },
      });
    }

    this.purgeExpired();
    for (const [id, p] of this.previews) {
      // 每位老師只保留最新一份（寫入中的那份保留到完成）
      if (p.teacherId === teacherId && p.state !== 'WRITING') this.previews.delete(id);
    }
    let previewId = randomBytes(9).toString('base64url');
    while (this.previews.has(previewId)) previewId = randomBytes(9).toString('base64url');
    const preview: WritebackPreview = {
      previewId,
      teacherId,
      activityId: activity.id,
      target,
      currentTitles: { spreadsheetTitle: sheet.spreadsheetTitle, sheetTitle: sheet.sheet.title },
      createdAt: this.deps.clock.now(),
      resultFingerprint: fingerprintOf(outcomes),
      items,
      skipped,
      summary: {
        emptyCount: items.filter((i) => i.status === 'EMPTY').length,
        overwriteCount: items.filter((i) => i.status === 'OVERWRITE').length,
        sameCount: items.filter((i) => i.status === 'SAME_CONTENT').length,
        unresolvedCount: items.filter(
          (i) => i.status === 'ANNOTATION_MISSING' || i.status === 'ANNOTATION_DUPLICATED',
        ).length,
        skippedQuestionCount: skipped.length,
      },
      state: 'READY',
      outcome: null,
    };
    this.previews.set(previewId, preview);
    return this.toView(preview);
  }

  /** 確認寫回（FR-012～FR-016a）；同一份預覽重複確認只寫一次（FR-015） */
  async confirm(
    teacherId: number,
    previewId: string,
    mode: unknown,
    fallbackKeys: unknown,
  ): Promise<WritebackOutcomeView> {
    // ---- 同步臨界區：第一個 await 之前完成檢查與狀態設定（research R8） ----
    this.purgeExpired();
    const preview = this.previews.get(previewId);
    if (!preview || preview.teacherId !== teacherId) throw appError('WRITEBACK_PREVIEW_EXPIRED');
    if (preview.state === 'DONE' && preview.outcome) return preview.outcome;
    if (preview.state === 'WRITING' || this.writing) throw appError('WRITEBACK_IN_PROGRESS');

    const modeCheck = WritebackRules.validateOverwriteMode(mode);
    if (!modeCheck.ok) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, modeCheck.message, {
        field: 'mode',
        hint: modeCheck.hint,
      });
    }
    const allowed = new Set(
      preview.items.filter((i) => i.status === 'ANNOTATION_MISSING').map((i) => i.key),
    );
    const keysCheck = WritebackRules.validateFallbackKeys(fallbackKeys, allowed);
    if (!keysCheck.ok) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, keysCheck.message, {
        field: 'fallbackKeys',
        hint: keysCheck.hint,
      });
    }
    const selected = new Set(keysCheck.value);
    const needsMode = preview.items.some(
      (i) =>
        i.status === 'OVERWRITE' ||
        (i.status === 'ANNOTATION_MISSING' &&
          selected.has(i.key) &&
          this.contentStatus(i) === 'OVERWRITE'),
    );
    if (needsMode && !modeCheck.value) throw appError('WRITEBACK_OVERWRITE_REQUIRED');

    preview.state = 'WRITING';
    this.writing = true;
    // ---- 以下才開始非同步呼叫 ----
    try {
      await this.recheck(preview);
      const plan = this.plan(preview, modeCheck.value, selected);
      try {
        await this.deps.sheets.writeCells(
          teacherId,
          preview.target.spreadsheetId,
          preview.target.sheetId,
          plan.updates,
        );
      } catch (err) {
        throw this.rephrase(err, preview.target);
      }
      const outcome: WritebackOutcome = {
        writtenCells: plan.updates.length,
        writtenQuestions: plan.writtenQuestions,
        overwrittenCells: plan.overwritten,
        skippedCells: plan.skipped.reduce((n, s) => n + s.count, 0),
        skippedReasons: plan.skipped,
        spreadsheetUrl: preview.target.sourceUrl,
      };
      preview.state = 'DONE';
      preview.outcome = outcome;
      this.record(preview, 'WRITEBACK_SUCCEEDED', outcome, null);
      this.deps.logger.info('writeback succeeded', {
        activityId: preview.activityId,
        written: outcome.writtenCells,
        overwritten: outcome.overwrittenCells,
        skipped: outcome.skippedCells,
      });
      return outcome;
    } catch (err) {
      const code: ErrorCode = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
      if (code === 'WRITEBACK_STALE') this.previews.delete(previewId);
      else preview.state = 'READY';
      this.record(preview, 'WRITEBACK_FAILED', null, code);
      this.deps.logger.warn('writeback failed', {
        activityId: preview.activityId,
        failureCode: code,
      });
      throw err;
    } finally {
      this.writing = false;
    }
  }

  /** 讀取目標分頁並把 Google 錯誤改寫成寫回情境的訊息（FR-016、US4-6） */
  private async readTarget(teacherId: number, target: WritebackTarget): Promise<SheetData> {
    try {
      return await this.deps.sheets.readSheet(teacherId, target.spreadsheetId, target.sheetId);
    } catch (err) {
      throw this.rephrase(err, target);
    }
  }

  private rephrase(err: unknown, target: WritebackTarget): unknown {
    if (!(err instanceof AppError)) return err;
    const text: Partial<Record<ErrorCode, { message: string; hint: string }>> = {
      GOOGLE_NOT_CONNECTED: {
        message: '請先連結 Google 帳號',
        hint: '請到「題目管理」按「連結 Google 帳號」',
      },
      GOOGLE_AUTH_EXPIRED: {
        message: 'Google 帳號授權已失效，請重新連結 Google 帳號',
        hint: '請到「題目管理」重新連結',
      },
      SHEET_NOT_FOUND: {
        message: '找不到這份試算表，可能已被刪除或移除共用',
        hint: `請確認「${target.spreadsheetTitle}」仍存在並分享給你連結的 Google 帳號`,
      },
      SHEET_TAB_NOT_FOUND: {
        message: `找不到學習單分頁「${target.sheetTitle}」，請確認分頁是否被刪除`,
        hint: '分頁被刪除時無法寫回，可改用「匯出結果 CSV」',
      },
      SHEET_NO_EDIT_PERMISSION: {
        message: '你連結的 Google 帳號沒有這份試算表的編輯權限',
        hint: '請試算表擁有者將你設為編輯者；試算表未被修改',
      },
      SHEET_PROTECTED_RANGE: {
        message: '作答格位於受保護範圍，無法寫入',
        hint: '請擁有者解除保護或將你加入可編輯名單；試算表未被修改',
      },
      GOOGLE_UNAVAILABLE: {
        message: '暫時無法連線到 Google 試算表，請稍後再試',
        hint: '可稍後再按「確認寫回」重試',
      },
      GOOGLE_RATE_LIMITED: {
        message: '暫時無法連線到 Google 試算表，請稍後再試',
        hint: 'Google 使用量暫時超過上限，請稍後重試',
      },
    };
    const t = text[err.code];
    return t ? new AppError(err.code, t.message, { hint: t.hint, details: err.details }) : err;
  }

  /** 不寫入的題目與原因（FR-008） */
  private skippedOf(outcomes: QuestionOutcome[]): SkippedQuestion[] {
    const skipped: SkippedQuestion[] = [];
    for (const o of outcomes) {
      if (o.status === 'NOT_OPENED')
        skipped.push({ questionNumber: o.label, reason: 'NOT_OPENED' });
      else if (o.status === 'ANSWERING')
        skipped.push({ questionNumber: o.label, reason: 'ANSWERING' });
      else if (!o.winner) skipped.push({ questionNumber: o.label, reason: 'NO_WINNER' });
    }
    return skipped;
  }

  /**
   * 依標註找出每個成功組別小題答案的作答格與目前內容（research R3、R5；預覽與確認共用）。
   * 找不到標註 → ANNOTATION_MISSING（附匯入當下位置）；兩個標註落在同一格 → ANNOTATION_DUPLICATED。
   */
  private resolveItems(
    outcomes: QuestionOutcome[],
    sheet: SheetData,
    fallbacks: AnswerSlotFallback[],
  ): WritebackItem[] {
    const { grid } = sheet;
    const decoded = this.deps.codec.decode(sheet.metadata, grid);
    const byKey = new Map(decoded.doc.questions.map((q) => [q.key, q]));
    const missing = new Set(
      decoded.warnings
        .filter(
          (w) =>
            w.code === 'RESTORED_CELL_MISSING' && w.questionKey && w.message.includes('作答格'),
        )
        .map((w) => `${w.questionKey}:${w.partIndex ?? 0}`),
    );
    const hasConflict = decoded.warnings.some((w) => w.code === 'RESTORED_CONFLICT');
    const fallbackOf = new Map(
      fallbacks.map((f) => [`${f.questionKey}:${f.partIndex}`, f.importedCell]),
    );
    const texts = new Map(grid.cells.map((c) => [c.ref, c.text]));
    const hiddenRows = new Set(grid.hiddenRows);
    const hiddenCols = new Set(grid.hiddenColumns);
    const contentAt = (cell: CellRef) =>
      texts.get(normalizeToMergeTopLeft(cell, grid.merges)) ?? '';
    const isHidden = (cell: CellRef) => {
      const p = parseCellRef(cell);
      return !!p && (hiddenRows.has(p.row) || hiddenCols.has(p.col));
    };

    const items: WritebackItem[] = [];
    for (const o of outcomes) {
      if (!o.winner || !o.questionKey) continue;
      const annotated = byKey.get(o.questionKey);
      for (const part of o.parts) {
        const key = `${o.questionKey}:${part.partIndex}`;
        const answer = o.winner.answers.find((a) => a.partIndex === part.partIndex)?.answer ?? '';
        const fallbackCell = fallbackOf.get(key) ?? part.fallbackCell ?? null;
        const located = annotated?.parts[part.partIndex]?.answerCell ?? null;
        const base = {
          key,
          questionKey: o.questionKey,
          questionNumber: o.label,
          partIndex: part.partIndex,
          partLabel: o.kind === 'GROUP' ? part.partLabel : null,
          fallbackCell,
          winnerTeamName: o.winner.teamName,
          answer,
        };
        if (located) {
          // 合併的作答格寫入其左上角（FR-014）
          const cell = normalizeToMergeTopLeft(located, grid.merges);
          const item = { ...base, cell, hidden: isHidden(cell), currentContent: contentAt(cell) };
          items.push({ ...item, status: this.contentStatus(item) });
          continue;
        }
        const duplicated = annotated !== undefined && !missing.has(key) && hasConflict;
        const target =
          duplicated || !fallbackCell ? null : normalizeToMergeTopLeft(fallbackCell, grid.merges);
        items.push({
          ...base,
          cell: null,
          hidden: target ? isHidden(target) : false,
          currentContent: target ? contentAt(target) : '',
          status: duplicated ? 'ANNOTATION_DUPLICATED' : 'ANNOTATION_MISSING',
          fallbackTarget: target,
        });
      }
    }
    return items;
  }

  /** 依目前內容判定：空白／將覆蓋／相同內容（trim 後比較，research R5） */
  private contentStatus(item: { currentContent: string; answer: string }): WritebackItemStatus {
    const current = item.currentContent.trim();
    if (current === '') return 'EMPTY';
    return current === item.answer.trim() ? 'SAME_CONTENT' : 'OVERWRITE';
  }

  /** 確認前重新讀取並比對位置、內容與結果指紋；任何不同 → WRITEBACK_STALE（FR-012） */
  private async recheck(preview: WritebackPreview): Promise<void> {
    const { reader, targets } = this.deps;
    const sheet = await this.readTarget(preview.teacherId, preview.target);
    const outcomes = reader.validResults(preview.activityId);
    const fresh = this.resolveItems(outcomes, sheet, targets.getFallbacks(preview.activityId));

    if (fingerprintOf(outcomes) !== preview.resultFingerprint) {
      const before = new Map(preview.items.map((i) => [i.key, i]));
      const changed = new Set<string>();
      for (const i of fresh) {
        const b = before.get(i.key);
        if (!b || b.answer !== i.answer || b.winnerTeamName !== i.winnerTeamName)
          changed.add(i.questionNumber);
      }
      for (const i of preview.items)
        if (!fresh.some((f) => f.key === i.key)) changed.add(i.questionNumber);
      const list = [...changed];
      throw appError('WRITEBACK_STALE', {
        message: `搶答結果在預覽後有變動${list.length ? `（${list.map(questionLabel).join('、')}）` : ''}，請重新預覽`,
        details: { questions: list },
      });
    }
    const now = new Map(fresh.map((i) => [i.key, i]));
    const changed = preview.items
      .filter((i) => {
        const f = now.get(i.key);
        return (
          !f || f.status !== i.status || f.cell !== i.cell || f.currentContent !== i.currentContent
        );
      })
      .map((i) => i.questionNumber);
    if (changed.length > 0) {
      const list = [...new Set(changed)];
      throw appError('WRITEBACK_STALE', {
        message: `學習單在預覽後有變動（${list.map((n) => `${questionLabel(n)}作答格`).join('、')}），請重新預覽`,
        details: { questions: list },
      });
    }
  }

  /** 依覆蓋選項與勾選的後備位置決定要寫的格子（data-model.md §3.3） */
  private plan(preview: WritebackPreview, mode: OverwriteMode | undefined, selected: Set<string>) {
    const updates: CellUpdate[] = [];
    const written = new Set<string>();
    const skipped = new Map<SkippedCellReason, number>();
    let overwritten = 0;
    const skip = (reason: SkippedCellReason) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
    const write = (item: WritebackItem, cell: CellRef, overwrite: boolean) => {
      // 只寫答案原文：不 trim、不加組名（Clarifications Q5）
      updates.push({ cell, value: item.answer });
      written.add(item.questionKey);
      if (overwrite) overwritten += 1;
    };
    for (const item of preview.items) {
      let cell = item.cell;
      let status = item.status;
      if (status === 'ANNOTATION_DUPLICATED') {
        skip('ANNOTATION_DUPLICATED');
        continue;
      }
      if (status === 'ANNOTATION_MISSING') {
        if (!selected.has(item.key) || !item.fallbackTarget) {
          skip('ANNOTATION_MISSING');
          continue;
        }
        cell = item.fallbackTarget;
        status = this.contentStatus(item);
      }
      if (!cell || status === 'SAME_CONTENT') continue;
      if (status === 'EMPTY') write(item, cell, false);
      else if (mode === 'OVERWRITE_ALL') write(item, cell, true);
      else skip('NON_EMPTY');
    }
    return {
      updates,
      writtenQuestions: written.size,
      overwritten,
      skipped: SKIP_REASON_ORDER.filter((r) => skipped.has(r)).map((reason) => ({
        reason,
        count: skipped.get(reason)!,
      })),
    };
  }

  private record(
    preview: WritebackPreview,
    type: 'WRITEBACK_SUCCEEDED' | 'WRITEBACK_FAILED',
    outcome: WritebackOutcome | null,
    failureCode: string | null,
  ) {
    this.deps.events.record({
      at: this.deps.clock.now(),
      actorId: preview.teacherId,
      activityId: preview.activityId,
      type,
      spreadsheetId: preview.target.spreadsheetId,
      written: outcome?.writtenCells ?? 0,
      overwritten: outcome?.overwrittenCells ?? 0,
      skipped: outcome?.skippedCells ?? 0,
      rows: 0,
      failureCode,
    });
  }

  private purgeExpired() {
    const now = this.deps.clock.now().getTime();
    for (const [id, p] of this.previews) {
      if (p.state !== 'WRITING' && now - p.createdAt.getTime() > PREVIEW_TTL_MS)
        this.previews.delete(id);
    }
  }

  private toView(p: WritebackPreview): WritebackPreviewView {
    return {
      previewId: p.previewId,
      expiresAt: new Date(p.createdAt.getTime() + PREVIEW_TTL_MS).toISOString(),
      target: { ...p.currentTitles, url: p.target.sourceUrl },
      items: p.items.map((i) => ({
        key: i.key,
        questionNumber: i.questionNumber,
        partLabel: i.partLabel,
        cell: i.cell,
        fallbackCell: i.fallbackCell,
        hidden: i.hidden,
        winnerTeamName: i.winnerTeamName,
        answer: i.answer,
        currentContent: i.currentContent,
        status: i.status,
      })),
      skipped: p.skipped.map((s) => ({ ...s })),
      summary: { ...p.summary },
    };
  }
}
