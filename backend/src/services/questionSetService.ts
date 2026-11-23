/**
 * QuestionSetService（組件圖 003-component、diagrams/003-sequence-reimport.puml）：
 * 目前題目集（只保留一份）的檢視、清除與重新匯入。
 */
import type { Issue, QuestionSetView } from '@buzzer/shared';
import type { QuestionEventRepository, QuestionSetRepository } from '../domain/questionPorts.js';
import type { QuestionSetRecord } from '../domain/questionTypes.js';
import type { Clock } from '../lib/clock.js';
import { appError } from '../lib/errors.js';
import type { DraftWithValidation, QuestionImportService } from './questionImportService.js';

/** 題目集（或預覽）對外格式（data-model.md §2.4）：格子位置加上分頁名稱。 */
export function recordToView(
  record: QuestionSetRecord,
  options: { warnings?: Issue[]; includeImportedAt?: boolean } = {},
): QuestionSetView {
  const sheet = record.set.source.sheetTitle;
  const at = (cell: string) => `${sheet}!${cell}`;
  return {
    source: record.set.source,
    questionCount: record.set.questionCount,
    slotCount: record.set.slotCount,
    ...(options.includeImportedAt === false
      ? {}
      : { importedAt: record.set.importedAt.toISOString() }),
    questions: record.questions.map((q) => ({
      label: q.label,
      kind: q.kind,
      stem: q.stemCell && q.stemText ? { text: q.stemText, cell: at(q.stemCell) } : null,
      parts: q.slots.map((s) => ({
        partLabel: s.partLabel,
        text: s.questionText,
        questionCell: at(s.questionCell),
        answerCell: at(s.answerCell),
        answerHasContent: s.answerHadContent,
      })),
    })),
    warnings: options.warnings ?? [],
  };
}

export interface QuestionSetServiceDeps {
  sets: QuestionSetRepository;
  events: QuestionEventRepository;
  imports: QuestionImportService;
  clock: Clock;
}

export class QuestionSetService {
  constructor(private readonly deps: QuestionSetServiceDeps) {}

  /** 目前題目集（FR-029）。 */
  getCurrent(): QuestionSetView | null {
    const record = this.deps.sets.findCurrent();
    return record ? recordToView(record) : null;
  }

  /** 清除題目集（US5）；試算表上的標註保留，下次匯入可帶回。 */
  clear(userId: number): void {
    const record = this.deps.sets.findCurrent();
    if (!record) return;
    this.deps.sets.clear();
    this.deps.events.record({
      at: this.deps.clock.now(),
      actorUserId: userId,
      type: 'CLEARED',
      spreadsheetId: record.set.source.spreadsheetId,
      sheetTitle: record.set.source.sheetTitle,
      questionCount: record.set.questionCount,
    });
  }

  /** 重新讀取目前題目集的來源並建立草稿，帶回試算表上的標註（US4）。 */
  async reimport(userId: number): Promise<DraftWithValidation> {
    const record = this.deps.sets.findCurrent();
    if (!record) {
      throw appError('NOT_FOUND', {
        message: '目前沒有題目集可重新匯入',
        hint: '請先貼上學習單連結匯入',
      });
    }
    const result = await this.deps.imports.createDraftFromSource(userId, record.set.source);
    this.deps.events.record({
      at: this.deps.clock.now(),
      actorUserId: userId,
      type: 'REIMPORTED',
      spreadsheetId: record.set.source.spreadsheetId,
      sheetTitle: record.set.source.sheetTitle,
      questionCount: record.set.questionCount,
    });
    return result;
  }
}
