/**
 * WritebackService 單元測試（005 FR-006～FR-015、FR-025；SC-009）。
 * 以真實 AnnotationCodec 產生標註、以 stub 取代 Google 與資料庫；資料皆為虛構。
 * 主要流程的端對端情境見 tests/integration/writeback.*.test.ts。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { AnnotationDocument, GridSnapshot, MergeRange, ProtectedArea } from '@buzzer/shared';
import type { ExportEvent, ExportEventRepository } from '../../src/db/exportEventRepository';
import type { WritebackTargetRepository } from '../../src/db/writebackTargetRepository';
import { AnnotationCodec } from '../../src/domain/annotationCodec';
import type { CellUpdate, SheetData } from '../../src/domain/questionPorts';
import { createFakeClock, type FakeClock } from '../../src/lib/clock';
import { AppError, appError } from '../../src/lib/errors';
import { createLogger } from '../../src/lib/logger';
import type {
  ActivityResultReader,
  QuestionOutcome,
} from '../../src/services/activityResultReader';
import { CsvExportService } from '../../src/services/csvExportService';
import { PREVIEW_TTL_MS, WritebackService } from '../../src/services/writebackService';

const SHEET_ID = 7;
const codec = new AnnotationCodec();

interface World {
  outcomes: QuestionOutcome[];
  cells: Map<string, string>;
  merges: MergeRange[];
  protectedAreas?: ProtectedArea[];
  doc: AnnotationDocument;
  rowCount: number;
  columnCount: number;
}

let world: World;
let clock: FakeClock;
let writes: CellUpdate[][];
let events: ExportEvent[];
let logs: string[];
let service: WritebackService;
/** 設定後 writeCells 會拋出此錯誤（模擬 Google 拒絕寫入） */
let rejectWrite: Error | null = null;

/** n 題、每題 parts 個小題：作答格在第 (i+1) 列、第 (p+2) 欄；每題由第 (i % 10 + 1) 組搶答成功 */
function buildWorld(n: number, parts: number, teams = 1): World {
  const outcomes: QuestionOutcome[] = [];
  const questions: AnnotationDocument['questions'] = [];
  const col = (p: number) => String.fromCharCode(66 + p); // B 起
  for (let i = 0; i < n; i++) {
    const key = `k${String(i).padStart(4, '0')}`;
    const winner = `T${(i % Math.max(teams, 1)) + 1}`;
    const answers = Array.from({ length: parts }, (_, p) => ({
      partIndex: p,
      answer: `答案 ${i}-${p}`,
    }));
    outcomes.push({
      questionId: `ACT-${i + 1}`,
      questionKey: key,
      position: i + 1,
      label: String(i + 1),
      kind: parts > 1 ? 'GROUP' : 'SINGLE',
      status: 'CLOSED',
      round: 1,
      openedAt: 1000,
      parts: Array.from({ length: parts }, (_, p) => ({
        partIndex: p,
        partLabel: parts > 1 ? `（${p + 1}）` : null,
        fallbackCell: `${col(p)}${i + 1}`,
      })),
      teams: Array.from({ length: teams }, (_, t) => ({
        teamId: `T${t + 1}`,
        teamName: `第 ${t + 1} 組`,
        groupNumber: t + 1,
      })),
      submissions: Array.from({ length: teams }, (_, t) => ({
        teamId: `T${((i + t) % teams) + 1}`,
        rank: t + 1,
        receivedAt: 2000 + t * 100,
        answers,
      })),
      winner: { teamId: winner, teamName: `第 ${(i % Math.max(teams, 1)) + 1} 組`, answers },
    });
    questions.push({
      key,
      label: String(i + 1),
      labelManual: false,
      kind: parts > 1 ? 'GROUP' : 'SINGLE',
      stemCell: null,
      parts: Array.from({ length: parts }, (_, p) => ({
        questionCell: null,
        answerCell: `${col(p)}${i + 1}`,
      })),
    });
  }
  return {
    outcomes,
    cells: new Map(),
    merges: [],
    doc: { questions },
    rowCount: n + 2,
    columnCount: parts + 3,
  };
}

function sheetData(): SheetData {
  const grid: GridSnapshot = {
    rowCount: world.rowCount,
    columnCount: world.columnCount,
    cells: [...world.cells].map(([ref, text]) => ({ ref, text, error: false })),
    merges: world.merges,
    hiddenRows: [],
    hiddenColumns: [],
    ...(world.protectedAreas ? { protectedAreas: world.protectedAreas } : {}),
  };
  return {
    spreadsheetId: 's'.repeat(30),
    spreadsheetTitle: '虛構學習單',
    sheets: [{ sheetId: SHEET_ID, title: '學習單' }],
    sheet: { sheetId: SHEET_ID, title: '學習單' },
    grid,
    metadata: codec.encode(world.doc, grid, SHEET_ID),
  };
}

function makeService() {
  writes = [];
  events = [];
  logs = [];
  const reader = {
    latestActivity: () => ({ id: 'ACT', startedAt: Date.parse('2026-11-24T01:30:00Z') }),
    validResults: () => world.outcomes,
  } as unknown as ActivityResultReader;
  const targets = {
    getTarget: () => ({
      activityId: 'ACT',
      spreadsheetId: 's'.repeat(30),
      spreadsheetTitle: '虛構學習單',
      sheetId: SHEET_ID,
      sheetTitle: '學習單',
      sourceUrl: 'https://docs.google.com/spreadsheets/d/sss/edit',
    }),
    getFallbacks: () => [],
  } as unknown as WritebackTargetRepository;
  const sheets = {
    readSheet: async () => sheetData(),
    writeCells: async (_u: number, _s: string, _id: number, updates: CellUpdate[]) => {
      if (rejectWrite) throw rejectWrite;
      writes.push(updates);
      for (const u of updates) world.cells.set(u.cell, u.value);
    },
  };
  const repo = { record: (e: ExportEvent) => events.push(e) } as unknown as ExportEventRepository;
  const logger = createLogger({ silent: false, sink: (line) => logs.push(line) });
  service = new WritebackService({ reader, targets, sheets, codec, events: repo, clock, logger });
  return { reader, repo, logger };
}

beforeEach(() => {
  clock = createFakeClock(new Date('2026-11-24T02:00:00Z'));
  rejectWrite = null;
});

describe('受保護範圍訊息指出題號（spec Edge Cases、T063）', () => {
  const protectedError = () => appError('SHEET_PROTECTED_RANGE');

  it('作答格落在受保護範圍 → 訊息列出該題題號，details.questions 為題號清單', async () => {
    world = buildWorld(4, 2);
    // 第 2 題（2）小題 C2、第 4 題整列受保護
    world.protectedAreas = [
      { startRow: 2, startCol: 3, endRow: 2, endCol: 3, except: [] },
      { startRow: 4, startCol: 1, endRow: 4, endCol: null, except: [] },
    ];
    makeService();
    const v = await service.preview(1);
    rejectWrite = protectedError();
    const err = await service
      .confirm(1, v.previewId, undefined, undefined)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: 'SHEET_PROTECTED_RANGE',
      message: '第 2、4 題作答格位於受保護範圍，無法寫入',
      details: { questions: ['2', '4'] },
    });
    expect((err as AppError).hint).toContain('解除保護');
    expect(writes).toHaveLength(0);
  });

  it('整張分頁受保護、但作答格在例外範圍內 → 不列出該題', async () => {
    world = buildWorld(3, 1);
    world.protectedAreas = [
      {
        startRow: 1,
        startCol: 1,
        endRow: null,
        endCol: null,
        except: [{ startRow: 1, startCol: 2, endRow: 2, endCol: 2 }],
      },
    ];
    makeService();
    const v = await service.preview(1);
    rejectWrite = protectedError();
    await expect(service.confirm(1, v.previewId, undefined, undefined)).rejects.toMatchObject({
      message: '第 3 題作答格位於受保護範圍，無法寫入',
    });
  });

  it('無法判斷是哪一格（沒有受保護範圍資訊或都不相交）→ 維持通用訊息', async () => {
    world = buildWorld(2, 1);
    makeService();
    const v = await service.preview(1);
    rejectWrite = protectedError();
    const err = await service
      .confirm(1, v.previewId, undefined, undefined)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: 'SHEET_PROTECTED_RANGE',
      message: '作答格位於受保護範圍，無法寫入',
    });

    world.protectedAreas = [{ startRow: 50, startCol: 1, endRow: 60, endCol: 5, except: [] }];
    await expect(service.confirm(1, v.previewId, undefined, undefined)).rejects.toMatchObject({
      message: '作答格位於受保護範圍，無法寫入',
    });
  });

  it('其他寫入錯誤不受影響（無編輯權限維持原訊息）', async () => {
    world = buildWorld(1, 1);
    world.protectedAreas = [{ startRow: 1, startCol: 1, endRow: null, endCol: null, except: [] }];
    makeService();
    const v = await service.preview(1);
    rejectWrite = appError('SHEET_NO_EDIT_PERMISSION');
    await expect(service.confirm(1, v.previewId, undefined, undefined)).rejects.toMatchObject({
      code: 'SHEET_NO_EDIT_PERMISSION',
      message: '你連結的 Google 帳號沒有這份試算表的編輯權限',
    });
  });
});

describe('preview／confirm 基本行為', () => {
  it('合併的作答格以左上角為目標，內容取左上角（FR-014）', async () => {
    world = buildWorld(1, 1);
    // 標註在合併範圍內的右側格 C1，合併範圍 B1:C1
    world.doc.questions[0]!.parts[0]!.answerCell = 'C1';
    world.merges = [{ start: 'B1', end: 'C1' }];
    world.cells.set('B1', '舊');
    makeService();
    const v = await service.preview(1);
    expect(v.items[0]).toMatchObject({ cell: 'B1', currentContent: '舊', status: 'OVERWRITE' });
    await service.confirm(1, v.previewId, 'OVERWRITE_ALL', undefined);
    expect(writes).toEqual([[{ cell: 'B1', value: '答案 0-0' }]]);
  });

  it('寫入答案原文：不 trim、不加組名，單一批次（Clarifications Q5、FR-013）', async () => {
    world = buildWorld(3, 2);
    world.outcomes[0]!.winner!.answers[0]!.answer = '  前後空白\n第二行  ';
    makeService();
    const v = await service.preview(1);
    const out = await service.confirm(1, v.previewId, undefined, undefined);
    expect(writes).toHaveLength(1);
    expect(writes[0]![0]).toEqual({ cell: 'B1', value: '  前後空白\n第二行  ' });
    expect(JSON.stringify(writes)).not.toContain('第 1 組');
    expect(out).toMatchObject({ writtenCells: 6, writtenQuestions: 3 });
  });

  it('預覽 15 分鐘後失效（邊界：剛好 15 分鐘仍有效）', async () => {
    world = buildWorld(1, 1);
    makeService();
    const a = await service.preview(1);
    clock.advance(PREVIEW_TTL_MS);
    await expect(service.confirm(1, a.previewId, undefined, undefined)).resolves.toMatchObject({
      writtenCells: 1,
    });
    const b = await service.preview(1);
    clock.advance(PREVIEW_TTL_MS + 1);
    await expect(service.confirm(1, b.previewId, undefined, undefined)).rejects.toMatchObject({
      code: 'WRITEBACK_PREVIEW_EXPIRED',
    });
  });

  it('其他老師的 previewId 視為失效', async () => {
    world = buildWorld(1, 1);
    makeService();
    const v = await service.preview(1);
    await expect(service.confirm(2, v.previewId, undefined, undefined)).rejects.toMatchObject({
      code: 'WRITEBACK_PREVIEW_EXPIRED',
    });
  });

  it('寫入中再次確認 → WRITEBACK_IN_PROGRESS；完成後回傳同一份結果（FR-015）', async () => {
    world = buildWorld(2, 1);
    makeService();
    const v = await service.preview(1);
    const first = service.confirm(1, v.previewId, undefined, undefined);
    await expect(service.confirm(1, v.previewId, undefined, undefined)).rejects.toMatchObject({
      code: 'WRITEBACK_IN_PROGRESS',
    });
    const out = await first;
    await expect(service.confirm(1, v.previewId, undefined, undefined)).resolves.toBe(out);
    expect(writes).toHaveLength(1);
  });

  it('後備格已有內容且被勾選時需要覆蓋選項（data-model.md §3.3）', async () => {
    world = buildWorld(2, 1);
    world.doc.questions[1]!.parts[0]!.answerCell = null; // 第 2 題找不到標註
    world.rowCount = 10;
    world.cells.set('B2', '老師筆記');
    makeService();
    const v = await service.preview(1);
    expect(v.items[1]).toMatchObject({
      status: 'ANNOTATION_MISSING',
      fallbackCell: 'B2',
      currentContent: '老師筆記',
    });
    await expect(service.confirm(1, v.previewId, undefined, ['k0001:0'])).rejects.toMatchObject({
      code: 'WRITEBACK_OVERWRITE_REQUIRED',
    });
    const out = await service.confirm(1, v.previewId, 'SKIP_NON_EMPTY', ['k0001:0']);
    expect(out).toMatchObject({
      writtenCells: 1,
      skippedReasons: [{ reason: 'NON_EMPTY', count: 1 }],
    });
    expect(world.cells.get('B2')).toBe('老師筆記');
  });

  it('mode 非允許值 → VALIDATION_ERROR（field mode），狀態不變可重試', async () => {
    world = buildWorld(1, 1);
    makeService();
    const v = await service.preview(1);
    const err = await service.confirm(1, v.previewId, 'ALL', undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR', field: 'mode' });
    await expect(service.confirm(1, v.previewId, undefined, undefined)).resolves.toMatchObject({
      writtenCells: 1,
    });
  });
});

describe('紀錄與 log 不含答案（FR-025、憲章原則 III）', () => {
  it('成功與失敗的紀錄只有計數與錯誤碼', async () => {
    world = buildWorld(2, 1);
    world.outcomes[0]!.winner!.answers[0]!.answer = '機密答案甲';
    makeService();
    const v = await service.preview(1);
    world.cells.set('B2', '別人改的');
    await expect(service.confirm(1, v.previewId, undefined, undefined)).rejects.toMatchObject({
      code: 'WRITEBACK_STALE',
    });
    const v2 = await service.preview(1);
    await service.confirm(1, v2.previewId, 'OVERWRITE_ALL', undefined);
    expect(events.map((e) => [e.type, e.failureCode, e.written, e.overwritten])).toEqual([
      ['WRITEBACK_FAILED', 'WRITEBACK_STALE', 0, 0],
      ['WRITEBACK_SUCCEEDED', null, 2, 1],
    ]);
    const all = JSON.stringify(events) + logs.join('\n');
    expect(all).not.toContain('機密答案甲');
    expect(all).not.toContain('別人改的');
  });
});

describe('效能（SC-009）', () => {
  it('10 組、200 題 × 10 小題：預覽、確認與 CSV 列組裝各在 10 秒內，寫回只呼叫一次 writeCells', async () => {
    world = buildWorld(200, 10, 10);
    makeService();
    let t0 = performance.now();
    const v = await service.preview(1);
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(v.items).toHaveLength(2000);
    t0 = performance.now();
    const out = await service.confirm(1, v.previewId, undefined, undefined);
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(out.writtenCells).toBe(2000);
    expect(writes).toHaveLength(1);

    const csv = new CsvExportService({
      reader: {
        latestActivity: () => ({ id: 'ACT', startedAt: 0 }),
        validResults: () => world.outcomes,
      } as never,
      events: { record: () => undefined } as never,
      clock,
      logger: createLogger({ silent: true }),
    });
    t0 = performance.now();
    const file = csv.export(1);
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(file.rows).toBe(200 * 10 * 10);
  }, 30_000);
});
